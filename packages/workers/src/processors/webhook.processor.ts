import { Job } from 'bullmq';
import { prisma } from '../services/prisma.service';
import { getQueue } from '../config/queues';
import {
  QueueName,
  WebhookJobData,
  EmailJobData,
  generateReceiptCode,
  renderReceiptPdf,
} from '@syncflow/shared';

// Processador encarregado de sincronizar o banco com os webhooks do Asaas
export async function processWebhook(job: Job<WebhookJobData>): Promise<void> {
  const { provider, event, payload } = job.data;

  if (provider !== 'asaas') {
    // Apenas processa webhooks do Asaas
    return;
  }

  // Extrai o ID do pagamento do Asaas de forma resiliente
  const paymentObj = payload.payment ? (payload.payment as any) : payload;
  const asaasPaymentId = paymentObj.id as string;

  if (!asaasPaymentId) {
    throw new Error('Asaas payment ID not found in webhook payload');
  }

  // Busca o pagamento no banco
  const dbPayment = await prisma.payment.findUnique({
    where: { gatewayPaymentId: asaasPaymentId },
    include: {
      registration: {
        include: {
          user: true,
          event: true,
          category: true,
          batch: true,
        },
      },
    },
  });

  if (!dbPayment) {
    throw new Error(`Payment record not found for asaasPaymentId ${asaasPaymentId}`);
  }

  const emailQueue = getQueue(QueueName.EMAIL);

  // 1. CONFIRMAÇÃO DO PAGAMENTO
  if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
    // Só atualiza se ainda não estiver pago
    if (dbPayment.status !== 'PAID') {
      const receiptCode = dbPayment.registration.receiptCode || generateReceiptCode();

      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: dbPayment.id },
          data: { status: 'PAID' },
        });

        await tx.registration.update({
          where: { id: dbPayment.registrationId },
          data: {
            status: 'CONFIRMED',
            paymentStatus: 'PAID',
            receiptCode,
          },
        });
      });

      // Gera comprovante PDF para anexar no e-mail (falha não bloqueia confirmação)
      let attachments: any[] | undefined = undefined;
      try {
        const metadata = (dbPayment.registration.metadata as any) || {};
        const rawShirtSize = metadata.shirtSize || metadata.complementaryData?.shirtSize || null;
        const pdfBuffer = await renderReceiptPdf({
          receiptCode,
          eventName: dbPayment.registration.event.title,
          eventDate: dbPayment.registration.event.date,
          eventLocation: dbPayment.registration.event.location,
          athleteName: dbPayment.registration.user.name || 'Participante',
          athleteCpf: dbPayment.registration.user.cpf || metadata.cpf || '',
          athleteBirthDate: dbPayment.registration.athleteBirthDate,
          athleteGender: dbPayment.registration.athleteGender,
          categoryName: dbPayment.registration.category?.name || 'Geral',
          batchName: dbPayment.registration.batch?.name || 'Lote Oficial',
          shirtSize: dbPayment.registration.event.hasKit ? rawShirtSize : null,
          amountPaid: Number(dbPayment.amount || 0),
          verificationUrl: `https://syncflow.com/verificar/${receiptCode}`,
          issuedAt: new Date(),
        });
        attachments = [
          {
            filename: `comprovante-${receiptCode}.pdf`,
            content: pdfBuffer.toString('base64'),
          },
        ];
      } catch (pdfErr) {
        console.error(`[WebhookProcessor] Falha ao gerar PDF de comprovante:`, pdfErr);
      }

      // Envia e-mail de confirmação da inscrição
      const emailJobData: EmailJobData = {
        to: dbPayment.registration.user.email,
        subject: 'Inscrição Confirmada!',
        templateId: 'REGISTRATION_CONFIRMED',
        tenantId: dbPayment.tenantId,
        variables: {
          userName: dbPayment.registration.user.name || 'Participante',
          eventName: dbPayment.registration.event.title,
        },
        attachments,
      };
      await emailQueue.add('send-email', emailJobData);
    }
    return;
  }

  // 2. EXPIRAÇÃO/ATRASO DO PAGAMENTO
  if (event === 'PAYMENT_OVERDUE' || event === 'PAYMENT_EXPIRED') {
    // Se a inscrição ainda estava pendente, devolve a vaga
    if (dbPayment.registration.status === 'PENDING' || dbPayment.registration.status === 'QUEUED') {
      await prisma.$transaction(async (tx) => {
        // Devolve vagas
        await tx.event.update({
          where: { id: dbPayment.registration.eventId },
          data: { availableSlots: { increment: 1 } },
        });

        await tx.category.update({
          where: { id: dbPayment.registration.categoryId },
          data: { availableSlots: { increment: 1 } },
        });

        await tx.batch.update({
          where: { id: dbPayment.registration.batchId },
          data: { soldQuantity: { decrement: 1 } },
        });

        // Devolve o uso do cupom se aplicável
        if (dbPayment.registration.couponId) {
          await tx.coupon.update({
            where: { id: dbPayment.registration.couponId },
            data: { usedCount: { decrement: 1 } },
          });
        }

        // Altera status de pagamento e inscrição
        await tx.payment.update({
          where: { id: dbPayment.id },
          data: { status: 'FAILED' },
        });

        await tx.registration.update({
          where: { id: dbPayment.registrationId },
          data: {
            status: 'EXPIRED',
            paymentStatus: 'FAILED',
          },
        });
      });

      // Envia notificação informando cancelamento por expiração
      const emailJobData: EmailJobData = {
        to: dbPayment.registration.user.email,
        subject: 'Sua inscrição expirou',
        templateId: 'REGISTRATION_EXPIRED',
        tenantId: dbPayment.tenantId,
        variables: {
          userName: dbPayment.registration.user.name || 'Participante',
          eventName: dbPayment.registration.event.title,
        },
      };
      await emailQueue.add('send-email', emailJobData);
    }
    return;
  }

  // 3. REEMBOLSO DO PAGAMENTO
  if (event === 'PAYMENT_REFUNDED') {
    // Devolve a vaga se a inscrição estava confirmada ou pendente
    if (
      dbPayment.registration.status === 'CONFIRMED' ||
      dbPayment.registration.status === 'PENDING'
    ) {
      await prisma.$transaction(async (tx) => {
        // Devolve vagas
        await tx.event.update({
          where: { id: dbPayment.registration.eventId },
          data: { availableSlots: { increment: 1 } },
        });

        await tx.category.update({
          where: { id: dbPayment.registration.categoryId },
          data: { availableSlots: { increment: 1 } },
        });

        await tx.batch.update({
          where: { id: dbPayment.registration.batchId },
          data: { soldQuantity: { decrement: 1 } },
        });

        // Devolve o uso do cupom se aplicável
        if (dbPayment.registration.couponId) {
          await tx.coupon.update({
            where: { id: dbPayment.registration.couponId },
            data: { usedCount: { decrement: 1 } },
          });
        }

        // Altera status para cancelado e reembolsado
        await tx.payment.update({
          where: { id: dbPayment.id },
          data: { status: 'REFUNDED' },
        });

        await tx.registration.update({
          where: { id: dbPayment.registrationId },
          data: {
            status: 'CANCELLED',
            paymentStatus: 'REFUNDED',
          },
        });
      });

      // Envia notificação de reembolso e cancelamento
      const emailJobData: EmailJobData = {
        to: dbPayment.registration.user.email,
        subject: 'Inscrição Cancelada e Reembolsada',
        templateId: 'REGISTRATION_REFUNDED',
        tenantId: dbPayment.tenantId,
        variables: {
          userName: dbPayment.registration.user.name || 'Participante',
          eventName: dbPayment.registration.event.title,
        },
      };
      await emailQueue.add('send-email', emailJobData);
    }
    return;
  }
}
