import { Job } from 'bullmq';
import { prisma } from '../services/prisma.service';
import { asaasService } from '../services/asaas.service';
import { getQueue } from '../config/queues';
import { QueueName } from '@syncflow/shared';
import { PaymentJobData, EmailJobData } from '@syncflow/shared';

// Processador encarregado de criar clientes e emitir cobranças no Asaas
export async function processPayment(job: Job<PaymentJobData>): Promise<void> {
  const {
    registrationId,
    tenantId,
    amount,
    method,
    customerEmail,
    customerName,
    customerCpf,
    creditCard,
    creditCardHolderInfo,
  } = job.data;

  // 1. Busca o Tenant no banco apenas para validar que ele existe
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  // 2. Cria o cliente no Asaas
  const asaasCustomerId = await asaasService.createCustomer({
    name: customerName,
    email: customerEmail,
    cpfCnpj: customerCpf || '',
  });

  // Data de vencimento da fatura (1 dia no futuro)
  const dueDateObj = new Date();
  dueDateObj.setDate(dueDateObj.getDate() + 1);
  const dueDate = dueDateObj.toISOString().split('T')[0];

  // 3. Cria a cobrança no Asaas
  const billingType = method === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX';
  const asaasPayment = await asaasService.createPayment({
    customerId: asaasCustomerId,
    billingType,
    value: amount,
    dueDate,
    externalReference: registrationId,
    creditCard,
    creditCardHolderInfo,
  });

  // 4. Fluxo específico de PIX (busca copia e cola do QRCode)
  if (method === 'PIX') {
    const pixDetails = await asaasService.getPixQrCode(asaasPayment.id);

    // Salva detalhes do PIX no banco
    await prisma.payment.upsert({
      where: { registrationId },
      create: {
        tenantId,
        registrationId,
        gatewayPaymentId: asaasPayment.id,
        amount,
        status: 'PENDING',
        method: 'PIX',
        pixQrCode: pixDetails.payload,
        pixExpiration: pixDetails.expirationDate ? new Date(pixDetails.expirationDate) : null,
      },
      update: {
        gatewayPaymentId: asaasPayment.id,
        status: 'PENDING',
        pixQrCode: pixDetails.payload,
        pixExpiration: pixDetails.expirationDate ? new Date(pixDetails.expirationDate) : null,
      },
    });

    // Enfileira notificação de pagamento pendente com o copia e cola
    const emailQueue = getQueue(QueueName.EMAIL);
    const emailJobData: EmailJobData = {
      to: customerEmail,
      subject: 'Inscrição Pendente — Copia e Cola PIX',
      templateId: 'PAYMENT_PENDING_PIX',
      tenantId,
      variables: {
        userName: customerName,
        pixQrCode: pixDetails.payload,
        amount: amount.toFixed(2),
      },
    };
    await emailQueue.add('send-email', emailJobData);

  } else {
    // 5. Fluxo específico de Cartão de Crédito
    let status = 'PENDING';
    if (asaasPayment.status === 'CONFIRMED' || asaasPayment.status === 'RECEIVED') {
      status = 'PAID';
    }

    await prisma.payment.upsert({
      where: { registrationId },
      create: {
        tenantId,
        registrationId,
        gatewayPaymentId: asaasPayment.id,
        amount,
        status,
        method: 'CREDIT_CARD',
      },
      update: {
        gatewayPaymentId: asaasPayment.id,
        status,
      },
    });

    if (status === 'PAID') {
      // Confirma inscrição imediatamente se o pagamento de cartão foi aprovado
      await prisma.registration.update({
        where: { id: registrationId },
        data: {
          paymentStatus: 'PAID',
          amountPaid: amount,
          status: 'CONFIRMED',
        },
      });

      const emailQueue = getQueue(QueueName.EMAIL);
      const emailJobData: EmailJobData = {
        to: customerEmail,
        subject: 'Sua inscrição foi confirmada!',
        templateId: 'PAYMENT_CONFIRMED',
        tenantId,
        variables: {
          userName: customerName,
          eventName: 'Evento',
          amount: amount.toFixed(2),
        },
      };
      await emailQueue.add('send-email', emailJobData);
    }
  }
}
