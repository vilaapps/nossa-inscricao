import { Job } from 'bullmq';
import { prisma } from '../services/prisma.service';
import { getQueue } from '../config/queues';
import {
  QueueName,
  RegistrationJobData,
  PaymentJobData,
  EmailJobData,
  calcOrder,
  effectiveFeeRate,
  generateReceiptCode,
  renderReceiptPdf,
} from '@syncflow/shared';
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

    // 3. Validação lógica de lote sob lock e de estoque de vagas
    const now = new Date();
    const isEventNotPublished = event.status ? event.status !== 'PUBLISHED' : false;
    const isEventDatePast = event.date ? now > new Date(event.date) : false;
    const isEventNotStarted = event.registrationOpensAt ? now < new Date(event.registrationOpensAt) : false;

    const isBatchActive = batch.active !== false;
    const isBatchNotStarted = batch.type === 'DATE' && batch.startDate ? now < new Date(batch.startDate) : false;
    const isBatchDateExpired = batch.type === 'DATE' && batch.endDate ? now > new Date(batch.endDate) : false;
    const isBatchSoldOut = batch.maxQuantity !== null && batch.maxQuantity !== undefined ? batch.soldQuantity >= batch.maxQuantity : false;
    const isBatchAvailable = isBatchActive && !isBatchNotStarted && !isBatchDateExpired && !isBatchSoldOut;

    const isEventAvailable = !isEventNotPublished && !isEventDatePast && !isEventNotStarted && event.availableSlots > 0;
    const isCategoryAvailable = category.availableSlots > 0;

    if (isEventAvailable && isCategoryAvailable && isBatchAvailable) {
      // 3.1 Há vagas e lote válido -> Dedução de vagas
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
      let coupon: any = null;
      let couponId: string | null = null;

      if (couponCode) {
        coupon = await tx.coupon.findFirst({
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
          await tx.coupon.update({
            where: { id: coupon.id },
            data: { usedCount: coupon.usedCount + 1 },
          });
        } else {
          coupon = null;
        }
      }

      // Aplicação de taxa administrativa efetiva via regra compartilhada
      const tenant = tx.tenant ? await tx.tenant.findUnique({ where: { id: tenantId } }) : null;
      const commissionRate = effectiveFeeRate(event, tenant);

      const orderCalc = calcOrder({
        basePrice: Number(batch.price),
        coupon: coupon
          ? {
              code: coupon.code,
              discountType: coupon.discountType as 'PERCENTAGE' | 'FIXED',
              discountValue: Number(coupon.discountValue),
            }
          : null,
        feeRate: commissionRate,
      });

      const receiptCode = registration.receiptCode || generateReceiptCode();
      const metadataObj = registration.metadata ? (registration.metadata as any) : {};
      const updatedMetadata = {
        ...metadataObj,
        subtotal: orderCalc.subtotal,
        adminFee: orderCalc.adminFee,
        commissionRate: orderCalc.feeRate,
        receiptCode,
      };

      // 3.2 Fluxo de Evento Gratuito ou Desconto de 100% (Item 2)
      if (orderCalc.isFree) {
        await tx.registration.update({
          where: { id: registrationId },
          data: {
            status: 'CONFIRMED',
            paymentStatus: 'PAID',
            amountPaid: 0,
            couponId,
            receiptCode,
            metadata: updatedMetadata,
          },
        });

        // Gera comprovante PDF para anexar no e-mail (falha não bloqueia confirmação)
        let attachments: any[] | undefined = undefined;
        try {
          const rawShirtSize = metadataObj.shirtSize || metadataObj.complementaryData?.shirtSize || null;
          const pdfBuffer = await renderReceiptPdf({
            receiptCode,
            eventName: event.title,
            eventDate: event.date,
            eventLocation: event.location,
            athleteName: registration.user.name || 'Participante',
            athleteCpf: registration.user.cpf || metadataObj.cpf || '',
            athleteBirthDate: registration.athleteBirthDate,
            athleteGender: registration.athleteGender,
            categoryName: category.name,
            batchName: batch.name,
            shirtSize: event.hasKit ? rawShirtSize : null,
            amountPaid: 0,
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
          console.error(`[RegistrationProcessor] Falha ao gerar PDF de comprovante:`, pdfErr);
        }

        // Enfileira confirmação por e-mail sem passar por gateway de pagamento
        const emailQueue = getQueue(QueueName.EMAIL);
        const emailJobData: EmailJobData = {
          to: registration.user.email,
          subject: `Inscrição Confirmada — ${event.title}`,
          templateId: 'REGISTRATION_CONFIRMED',
          tenantId,
          variables: {
            userName: registration.user.name || 'Participante',
            athleteName: registration.user.name || 'Participante',
            eventName: event.title,
            eventTitle: event.title,
            receiptCode,
            isFree: 'true',
          },
          attachments,
        };

        await emailQueue.add('send-email', emailJobData);
        return;
      }

      // 3.3 Fluxo Pago -> PENDING e enfileiramento na payment-queue
      await tx.registration.update({
        where: { id: registrationId },
        data: {
          status: 'PENDING',
          amountPaid: orderCalc.total,
          couponId,
          receiptCode,
          metadata: updatedMetadata,
        },
      });

      const paymentQueue = getQueue(QueueName.PAYMENT);
      const method: 'PIX' | 'CREDIT_CARD' = metadataObj.paymentMethod === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX';

      const paymentJobData: PaymentJobData = {
        registrationId,
        orderId: registrationId,
        userId,
        tenantId,
        amount: orderCalc.total,
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
      // 3.4 Vagas Esgotadas ou Lote Encerrado/Não Aberto -> Reprovado
      await tx.registration.update({
        where: { id: registrationId },
        data: {
          status: 'REJECTED',
        },
      });

      const emailQueue = getQueue(QueueName.EMAIL);

      if (isEventNotStarted || isBatchNotStarted) {
        await emailQueue.add('send-email', {
          to: registration.user.email,
          subject: 'Inscrição Não Concluída - Lote Ainda Não Aberto',
          templateId: 'REGISTRATION_BATCH_NOT_STARTED',
          tenantId,
          variables: {
            userName: registration.user.name || 'Participante',
            eventName: event.title,
            batchName: batch.name,
          },
        });
      } else if (isBatchDateExpired || isBatchSoldOut) {
        await emailQueue.add('send-email', {
          to: registration.user.email,
          subject: 'Inscrição Não Concluída - Lote Encerrado',
          templateId: 'REGISTRATION_BATCH_CLOSED',
          tenantId,
          variables: {
            userName: registration.user.name || 'Participante',
            eventName: event.title,
            batchName: batch.name,
          },
        });
      } else {
        await emailQueue.add('send-email', {
          to: registration.user.email,
          subject: 'Inscrição Não Concluída - Vagas Esgotadas',
          templateId: 'REGISTRATION_REJECTED_OUT_OF_SLOTS',
          tenantId,
          variables: {
            userName: registration.user.name || 'Participante',
            eventName: event.title,
          },
        });
      }
    }
  });
}
