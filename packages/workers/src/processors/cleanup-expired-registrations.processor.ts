import { prisma } from '../services/prisma.service';
import { asaasService } from '../services/asaas.service';
import { getQueue } from '../config/queues';
import { QueueName } from '@syncflow/shared';
import { EmailJobData } from '@syncflow/shared';

export async function cleanupExpiredRegistrations(): Promise<void> {
  console.log('[Cleanup] Running expired registrations cleanup...');
  
  const pendingRegistrations = await prisma.registration.findMany({
    where: {
      status: 'PENDING',
      paymentStatus: 'PENDING',
    },
    include: {
      batch: true,
      payment: true,
      user: true,
      event: true,
    },
  });

  const now = new Date();
  const expiredRegistrations = pendingRegistrations.filter((reg) => {
    const expirationMinutes = reg.batch.expirationTimeMinutes ?? 60;
    const expirationTime = new Date(reg.createdAt.getTime() + expirationMinutes * 60 * 1000);
    return now > expirationTime;
  });

  console.log(`[Cleanup] Found ${expiredRegistrations.length} expired registrations out of ${pendingRegistrations.length} pending.`);

  const emailQueue = getQueue(QueueName.EMAIL);

  for (const reg of expiredRegistrations) {
    try {
      console.log(`[Cleanup] Expiring registration ${reg.id}...`);

      // 1. Cancel/Delete payment on Asaas first (if applicable)
      if (reg.payment?.gatewayPaymentId) {
        try {
          await asaasService.deletePayment(reg.payment.gatewayPaymentId);
          console.log(`[Cleanup] Successfully deleted Asaas payment ${reg.payment.gatewayPaymentId} for registration ${reg.id}`);
        } catch (err: any) {
          console.error(`[Cleanup] Failed to delete Asaas payment ${reg.payment.gatewayPaymentId} for registration ${reg.id}:`, err.message);
          // Skip this registration to avoid inconsistent state (e.g. if paid on Asaas)
          continue;
        }
      }

      // 2. Perform database updates in a transaction
      await prisma.$transaction(async (tx) => {
        // Revert event slots
        await tx.event.update({
          where: { id: reg.eventId },
          data: { availableSlots: { increment: 1 } },
        });

        // Revert category slots
        await tx.category.update({
          where: { id: reg.categoryId },
          data: { availableSlots: { increment: 1 } },
        });

        // Revert batch sold quantity
        await tx.batch.update({
          where: { id: reg.batchId },
          data: { soldQuantity: { decrement: 1 } },
        });

        // Revert coupon usage if applicable
        if (reg.couponId) {
          await tx.coupon.update({
            where: { id: reg.couponId },
            data: { usedCount: { decrement: 1 } },
          });
        }

        // Update payment status (if exists)
        if (reg.payment) {
          await tx.payment.update({
            where: { id: reg.payment.id },
            data: { status: 'FAILED' },
          });
        }

        // Update registration status and paymentStatus
        await tx.registration.update({
          where: { id: reg.id },
          data: {
            status: 'EXPIRED',
            paymentStatus: 'CANCELLED',
          },
        });
      });

      // 3. Enqueue expiration email
      const emailJobData: EmailJobData = {
        to: reg.user.email,
        subject: 'Sua inscrição expirou',
        templateId: 'REGISTRATION_EXPIRED',
        tenantId: reg.tenantId,
        variables: {
          userName: reg.user.name || 'Participante',
          eventName: reg.event.title,
        },
      };
      await emailQueue.add('send-email', emailJobData);

      console.log(`[Cleanup] Registration ${reg.id} has been expired and notifications enqueued.`);
    } catch (err: any) {
      console.error(`[Cleanup] Error processing expiration for registration ${reg.id}:`, err);
    }
  }
}
