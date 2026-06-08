import { Job } from 'bullmq';
import { prisma } from '../services/prisma.service';
import { getQueue } from '../config/queues';
import { QueueName } from '@syncflow/shared';
import { RegistrationJobData, PaymentJobData, EmailJobData } from '@syncflow/shared';
import { cleanupExpiredRegistrations } from './cleanup-expired-registrations.processor';

// Processador da fila de inscrições concorrentes com locks pessimistas
export async function processRegistration(job: Job<RegistrationJobData>): Promise<void> {
  if (job.name === 'cleanup-expired-registrations') {
    await cleanupExpiredRegistrations();
    return;
  }

  const { registrationId, userId, eventId, categoryId, batchId, tenantId, couponCode } = job.data;

  await prisma.$transaction(async (tx) => {
    // 1. Lock pessimista (SELECT ... FOR UPDATE) nas linhas concorridas do PostgreSQL
    const [event] = await tx.$queryRaw<any[]>`
      SELECT * FROM "Event" WHERE id = ${eventId} FOR UPDATE
    `;
    if (!event) {
      throw new Error(`Event ${eventId} not found`);
    }

    const [category] = await tx.$queryRaw<any[]>`
      SELECT * FROM "Category" WHERE id = ${categoryId} FOR UPDATE
    `;
    if (!category) {
      throw new Error(`Category ${categoryId} not found`);
    }

    const [batch] = await tx.$queryRaw<any[]>`
      SELECT * FROM "Batch" WHERE id = ${batchId} FOR UPDATE
    `;
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    // 2. Localiza a inscrição e seu status atual
    const registration = await tx.registration.findUnique({
      where: { id: registrationId },
      include: { user: true },
    });

    if (!registration) {
      throw new Error(`Registration ${registrationId} not found`);
    }

    // Se já foi processado anteriormente (duplicidade/timeout), ignora
    if (registration.status !== 'QUEUED') {
      return;
    }

    // 3. Validação lógica de estoque (Vagas livres)
    const isEventAvailable = event.availableSlots > 0;
    const isCategoryAvailable = category.availableSlots > 0;
    const isBatchAvailable = batch.maxQuantity === null || batch.soldQuantity < batch.maxQuantity;

    if (isEventAvailable && isCategoryAvailable && isBatchAvailable) {
      // 3.1 Há vagas -> Dedução de vagas e alteração para PENDING
      await tx.event.update({
        where: { id: eventId },
        data: { availableSlots: event.availableSlots - 1 },
      });

      await tx.category.update({
        where: { id: categoryId },
        data: { availableSlots: category.availableSlots - 1 },
      });

      await tx.batch.update({
        where: { id: batchId },
        data: { soldQuantity: batch.soldQuantity + 1 },
      });

      // Aplicação de desconto se houver cupom
      let finalPrice = Number(batch.price);
      let couponId: string | null = null;

      if (couponCode) {
        const coupon = await tx.coupon.findFirst({
          where: {
            eventId,
            code: couponCode,
            active: true,
            OR: [
              { validUntil: null },
              { validUntil: { gte: new Date() } },
            ],
          },
        });

        if (coupon && (coupon.maxUses === null || coupon.usedCount < coupon.maxUses)) {
          couponId = coupon.id;
          const discount = Number(coupon.discountValue);
          if (coupon.discountType === 'PERCENTAGE') {
            finalPrice = finalPrice * (1 - discount / 100);
          } else if (coupon.discountType === 'FIXED') {
            finalPrice = Math.max(0, finalPrice - discount);
          }

          await tx.coupon.update({
            where: { id: coupon.id },
            data: { usedCount: coupon.usedCount + 1 },
          });
        }
      }

      await tx.registration.update({
        where: { id: registrationId },
        data: {
          status: 'PENDING',
          amountPaid: finalPrice,
          couponId,
        },
      });

      // 4. Enfileira o job de pagamento na fila payment-queue
      const paymentQueue = getQueue(QueueName.PAYMENT);
      const metadataObj = registration.metadata ? (registration.metadata as any) : {};
      const method: 'PIX' | 'CREDIT_CARD' = metadataObj.paymentMethod === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX';

      const paymentJobData: PaymentJobData = {
        registrationId,
        orderId: registrationId,
        userId,
        tenantId,
        amount: finalPrice,
        method,
        customerEmail: registration.user.email,
        customerName: registration.user.name || 'Participante',
        customerCpf: metadataObj.cpf || '',
      };

      if (method === 'CREDIT_CARD' && metadataObj.cardDetails) {
        const card = metadataObj.cardDetails;
        paymentJobData.creditCard = {
          holderName: card.holderName,
          number: card.number,
          expiryMonth: card.expiryMonth,
          expiryYear: card.expiryYear,
          ccv: card.ccv,
        };
        paymentJobData.creditCardHolderInfo = {
          name: card.holderName,
          email: registration.user.email,
          cpfCnpj: card.holderCpf || metadataObj.cpf || '',
          postalCode: card.holderZipCode || '',
          phone: metadataObj.phone || '21999999999',
          addressNumber: 'S/N',
        };
      }

      await paymentQueue.add('process-payment', paymentJobData);

    } else {
      // 3.2 Vagas Esgotadas -> Reprovado
      await tx.registration.update({
        where: { id: registrationId },
        data: {
          status: 'REJECTED',
        },
      });

      // Enfileira job de e-mail notificando o esgotamento
      const emailQueue = getQueue(QueueName.EMAIL);
      const emailJobData: EmailJobData = {
        to: registration.user.email,
        subject: 'Inscrição Não Concluída - Vagas Esgotadas',
        templateId: 'REGISTRATION_REJECTED_OUT_OF_SLOTS',
        tenantId,
        variables: {
          userName: registration.user.name || 'Participante',
          eventName: event.title,
        },
      };

      await emailQueue.add('send-email', emailJobData);
    }
  });
}
