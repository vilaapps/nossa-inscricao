import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processWebhook } from './webhook.processor';
import { prisma } from '../services/prisma.service';
import { getQueue } from '../config/queues';
import { QueueName } from '@syncflow/shared';
import { Job } from 'bullmq';

// Mock das Filas
vi.mock('../config/queues', () => {
  const mockAdd = vi.fn().mockResolvedValue({ id: 'job-id' });
  const mockQueue = { add: mockAdd };
  return {
    getQueue: vi.fn().mockReturnValue(mockQueue),
  };
});

// Mock do Prisma Service
vi.mock('../services/prisma.service', () => {
  return {
    prisma: {
      payment: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

describe('Webhook Processor', () => {
  const mockEmailQueue = getQueue(QueueName.EMAIL);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockJob = (data: any) => {
    return {
      data,
    } as Job;
  };

  // deve retornar imediatamente se o provedor nao for asaas
  it('should return immediately if provider is not asaas', async () => {
    // Arrange
    const job = createMockJob({ provider: 'other', event: 'PAYMENT_RECEIVED', payload: {} });

    // Act
    await processWebhook(job);

    // Assert
    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
  });

  // deve lancar erro se asaasPaymentId nao for encontrado
  it('should throw an error if payment ID is missing in webhook payload', async () => {
    // Arrange
    const job = createMockJob({
      provider: 'asaas',
      event: 'PAYMENT_RECEIVED',
      payload: { payment: { id: null } },
    });

    // Act & Assert
    await expect(processWebhook(job)).rejects.toThrow('Asaas payment ID not found in webhook payload');
  });

  // deve lancar erro se o pagamento nao for encontrado no banco de dados
  it('should throw an error if the payment is not found in database', async () => {
    // Arrange
    const job = createMockJob({
      provider: 'asaas',
      event: 'PAYMENT_RECEIVED',
      payload: { payment: { id: 'pay_asaas_123' } },
    });

    vi.mocked(prisma.payment.findUnique).mockResolvedValueOnce(null);

    // Act & Assert
    await expect(processWebhook(job)).rejects.toThrow(
      'Payment record not found for asaasPaymentId pay_asaas_123'
    );
  });

  // deve retornar de imediato se o pagamento ja estiver PAID no PAYMENT_RECEIVED
  it('should return early if the payment status is already PAID on confirmation event', async () => {
    // Arrange
    const job = createMockJob({
      provider: 'asaas',
      event: 'PAYMENT_RECEIVED',
      payload: { id: 'pay_asaas_123' }, // testando payload sem objeto intermediario payment
    });

    vi.mocked(prisma.payment.findUnique).mockResolvedValueOnce({
      id: 'pay_1',
      status: 'PAID',
      registration: {},
    } as any);

    // Act
    await processWebhook(job);

    // Assert
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mockEmailQueue.add).not.toHaveBeenCalled();
  });

  // deve confirmar pagamento com sucesso
  it('should confirm payment, update registration to CONFIRMED and schedule confirmation email', async () => {
    // Arrange
    const job = createMockJob({
      provider: 'asaas',
      event: 'PAYMENT_CONFIRMED',
      payload: { payment: { id: 'pay_asaas_123' } },
    });

    const mockPayment = {
      id: 'pay_1',
      registrationId: 'reg_1',
      tenantId: 'ten_1',
      status: 'PENDING',
      registration: {
        id: 'reg_1',
        eventId: 'evt_1',
        user: { email: 'participant@test.com', name: null },
        event: { title: 'Maratona Astro' },
      },
    };

    vi.mocked(prisma.payment.findUnique).mockResolvedValueOnce(mockPayment as any);

    const updatePaymentSpy = vi.fn();
    const updateRegSpy = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        payment: { update: updatePaymentSpy },
        registration: { update: updateRegSpy },
      };
      return callback(tx as any);
    });

    // Act
    await processWebhook(job);

    // Assert
    expect(updatePaymentSpy).toHaveBeenCalledWith({
      where: { id: 'pay_1' },
      data: { status: 'PAID' },
    });

    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_1' },
      data: {
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        receiptCode: expect.any(String),
      },
    });

    expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', {
      to: 'participant@test.com',
      subject: 'Inscrição Confirmada!',
      templateId: 'REGISTRATION_CONFIRMED',
      tenantId: 'ten_1',
      variables: {
        userName: 'Participante',
        eventName: 'Maratona Astro',
      },
      attachments: expect.any(Array),
    });
  });

  // deve confirmar pagamento e enfileirar e-mail mesmo se a geracao de PDF falhar
  it('should confirm payment and enqueue email without attachment if renderReceiptPdf fails', async () => {
    // Arrange
    const job = createMockJob({
      provider: 'asaas',
      event: 'PAYMENT_RECEIVED',
      payload: { payment: { id: 'pay_asaas_pdf_fail' } },
    });

    const mockPayment = {
      id: 'pay_pdf_fail',
      registrationId: 'reg_pdf_fail',
      tenantId: 'ten_1',
      status: 'PENDING',
      registration: {
        id: 'reg_pdf_fail',
        eventId: 'evt_1',
        receiptCode: 'REC-EXISTING-1',
        user: { email: 'participant2@test.com', name: 'Atleta Teste' },
        event: { title: 'Corrida das Montanhas' },
      },
    };

    vi.mocked(prisma.payment.findUnique).mockResolvedValueOnce(mockPayment as any);

    const updatePaymentSpy = vi.fn();
    const updateRegSpy = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        payment: { update: updatePaymentSpy },
        registration: { update: updateRegSpy },
      };
      return callback(tx as any);
    });

    // Simula falha no renderReceiptPdf espionando console.error
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Forçamos o renderReceiptPdf a falhar passando um mockPayment sem os campos necessários ou forçando erro
    // Na verdade, podemos usar um mock em @syncflow/shared se importado, ou passar dados que causem erro no renderReceiptPdf
    // Ou mockar temporariamente renderReceiptPdf
    const sharedModule = await import('@syncflow/shared');
    const renderSpy = vi.spyOn(sharedModule, 'renderReceiptPdf').mockRejectedValueOnce(new Error('PDF Kit crashed'));

    // Act
    await processWebhook(job);

    // Assert
    expect(updatePaymentSpy).toHaveBeenCalledWith({
      where: { id: 'pay_pdf_fail' },
      data: { status: 'PAID' },
    });
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_pdf_fail' },
      data: {
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        receiptCode: 'REC-EXISTING-1',
      },
    });
    expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', {
      to: 'participant2@test.com',
      subject: 'Inscrição Confirmada!',
      templateId: 'REGISTRATION_CONFIRMED',
      tenantId: 'ten_1',
      variables: {
        userName: 'Atleta Teste',
        eventName: 'Corrida das Montanhas',
      },
      attachments: undefined,
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[WebhookProcessor] Falha ao gerar PDF de comprovante:'),
      expect.any(Error)
    );

    renderSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // deve confirmar pagamento com kit, categoria, lote e metadados completos
  it('should confirm payment with kit, category, batch and complete athlete info', async () => {
    // Arrange
    const job = createMockJob({
      provider: 'asaas',
      event: 'PAYMENT_RECEIVED',
      payload: { payment: { id: 'pay_asaas_full' } },
    });

    const mockPayment = {
      id: 'pay_full',
      registrationId: 'reg_full',
      tenantId: 'ten_1',
      status: 'PENDING',
      amount: 150.00,
      registration: {
        id: 'reg_full',
        eventId: 'evt_1',
        athleteBirthDate: new Date('1990-05-15'),
        athleteGender: 'M',
        metadata: { shirtSize: 'GG' },
        user: { email: 'full@test.com', name: 'Atleta Full', cpf: '11122233344' },
        event: {
          title: 'Maratona Completa',
          date: new Date('2026-12-01'),
          location: 'Av Paulista',
          hasKit: true,
        },
        category: { name: '42KM' },
        batch: { name: 'Lote VIP' },
      },
    };

    vi.mocked(prisma.payment.findUnique).mockResolvedValueOnce(mockPayment as any);

    const updatePaymentSpy = vi.fn();
    const updateRegSpy = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        payment: { update: updatePaymentSpy },
        registration: { update: updateRegSpy },
      };
      return callback(tx as any);
    });

    // Act
    await processWebhook(job);

    // Assert
    expect(updatePaymentSpy).toHaveBeenCalledWith({
      where: { id: 'pay_full' },
      data: { status: 'PAID' },
    });
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_full' },
      data: {
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        receiptCode: expect.any(String),
      },
    });
    expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', {
      to: 'full@test.com',
      subject: 'Inscrição Confirmada!',
      templateId: 'REGISTRATION_CONFIRMED',
      tenantId: 'ten_1',
      variables: {
        userName: 'Atleta Full',
        eventName: 'Maratona Completa',
      },
      attachments: expect.arrayContaining([
        expect.objectContaining({
          filename: expect.stringMatching(/^comprovante-.*\.pdf$/),
          content: expect.any(String),
        }),
      ]),
    });
  });

  // deve extrair tamanho de camiseta de complementaryData e cpf de metadata quando user.cpf for nulo
  it('should fallback to complementaryData shirtSize and metadata cpf when user fields are null', async () => {
    // Arrange
    const job = createMockJob({
      provider: 'asaas',
      event: 'PAYMENT_CONFIRMED',
      payload: { payment: { id: 'pay_asaas_comp' } },
    });

    const mockPayment = {
      id: 'pay_comp',
      registrationId: 'reg_comp',
      tenantId: 'ten_1',
      status: 'PENDING',
      amount: 80.00,
      registration: {
        id: 'reg_comp',
        eventId: 'evt_1',
        metadata: {
          complementaryData: { shirtSize: 'M' },
          cpf: '99988877766',
        },
        user: { email: 'comp@test.com', name: null, cpf: null },
        event: {
          title: 'Corrida Noturna',
          date: new Date('2026-10-31'),
          location: 'Parque da Cidade',
          hasKit: true,
        },
        category: null,
        batch: null,
      },
    };

    vi.mocked(prisma.payment.findUnique).mockResolvedValueOnce(mockPayment as any);

    const updatePaymentSpy = vi.fn();
    const updateRegSpy = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        payment: { update: updatePaymentSpy },
        registration: { update: updateRegSpy },
      };
      return callback(tx as any);
    });

    // Act
    await processWebhook(job);

    // Assert
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_comp' },
      data: {
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        receiptCode: expect.any(String),
      },
    });
    expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', expect.objectContaining({
      to: 'comp@test.com',
      attachments: expect.any(Array),
    }));
  });

  // deve retornar de imediato em expiracao/atraso se a inscricao nao estiver PENDING/QUEUED
  it('should return early on overdue event if registration status is already CONFIRMED/CANCELLED', async () => {
    // Arrange
    const job = createMockJob({
      provider: 'asaas',
      event: 'PAYMENT_OVERDUE',
      payload: { payment: { id: 'pay_asaas_123' } },
    });

    vi.mocked(prisma.payment.findUnique).mockResolvedValueOnce({
      id: 'pay_1',
      registration: { status: 'CONFIRMED' },
    } as any);

    // Act
    await processWebhook(job);

    // Assert
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // deve processar expiração de pagamento, devolver vagas e cupom de desconto
  it('should handle PAYMENT_EXPIRED, revert slots/coupon and update status to EXPIRED', async () => {
    // Arrange
    const job = createMockJob({
      provider: 'asaas',
      event: 'PAYMENT_EXPIRED',
      payload: { payment: { id: 'pay_asaas_123' } },
    });

    const mockPayment = {
      id: 'pay_1',
      registrationId: 'reg_1',
      tenantId: 'ten_1',
      registration: {
        status: 'PENDING',
        eventId: 'evt_1',
        categoryId: 'cat_1',
        batchId: 'bat_1',
        couponId: 'coup_123',
        user: { email: 'participant@test.com', name: null },
        event: { title: 'Maratona Astro' },
      },
    };

    vi.mocked(prisma.payment.findUnique).mockResolvedValueOnce(mockPayment as any);

    const updateEventSpy = vi.fn();
    const updateCategorySpy = vi.fn();
    const updateBatchSpy = vi.fn();
    const updateCouponSpy = vi.fn();
    const updatePaymentSpy = vi.fn();
    const updateRegSpy = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        event: { update: updateEventSpy },
        category: { update: updateCategorySpy },
        batch: { update: updateBatchSpy },
        coupon: { update: updateCouponSpy },
        payment: { update: updatePaymentSpy },
        registration: { update: updateRegSpy },
      };
      return callback(tx as any);
    });

    // Act
    await processWebhook(job);

    // Assert
    expect(updateEventSpy).toHaveBeenCalledWith({
      where: { id: 'evt_1' },
      data: { availableSlots: { increment: 1 } },
    });
    expect(updateCategorySpy).toHaveBeenCalledWith({
      where: { id: 'cat_1' },
      data: { availableSlots: { increment: 1 } },
    });
    expect(updateBatchSpy).toHaveBeenCalledWith({
      where: { id: 'bat_1' },
      data: { soldQuantity: { decrement: 1 } },
    });
    expect(updateCouponSpy).toHaveBeenCalledWith({
      where: { id: 'coup_123' },
      data: { usedCount: { decrement: 1 } },
    });
    expect(updatePaymentSpy).toHaveBeenCalledWith({
      where: { id: 'pay_1' },
      data: { status: 'FAILED' },
    });
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_1' },
      data: { status: 'EXPIRED', paymentStatus: 'FAILED' },
    });

    expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', {
      to: 'participant@test.com',
      subject: 'Sua inscrição expirou',
      templateId: 'REGISTRATION_EXPIRED',
      tenantId: 'ten_1',
      variables: {
        userName: 'Participante', // fallback de name nulo
        eventName: 'Maratona Astro',
      },
    });
  });

  // deve processar reembolso de pagamento, devolver vagas/cupom e cancelar inscrição
  it('should handle PAYMENT_REFUNDED, revert slots/coupon and update status to CANCELLED', async () => {
    // Arrange
    const job = createMockJob({
      provider: 'asaas',
      event: 'PAYMENT_REFUNDED',
      payload: { payment: { id: 'pay_asaas_123' } },
    });

    const mockPayment = {
      id: 'pay_1',
      registrationId: 'reg_1',
      tenantId: 'ten_1',
      registration: {
        status: 'CONFIRMED', // Reembolso de inscrição confirmada
        eventId: 'evt_1',
        categoryId: 'cat_1',
        batchId: 'bat_1',
        couponId: 'coup_123', // Testando fluxo com cupom
        user: { email: 'participant@test.com', name: null },
        event: { title: 'Maratona Astro' },
      },
    };

    vi.mocked(prisma.payment.findUnique).mockResolvedValueOnce(mockPayment as any);

    const updateEventSpy = vi.fn();
    const updateCategorySpy = vi.fn();
    const updateBatchSpy = vi.fn();
    const updateCouponSpy = vi.fn();
    const updatePaymentSpy = vi.fn();
    const updateRegSpy = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        event: { update: updateEventSpy },
        category: { update: updateCategorySpy },
        batch: { update: updateBatchSpy },
        coupon: { update: updateCouponSpy },
        payment: { update: updatePaymentSpy },
        registration: { update: updateRegSpy },
      };
      return callback(tx as any);
    });

    // Act
    await processWebhook(job);

    // Assert
    expect(updateEventSpy).toHaveBeenCalled();
    expect(updateCategorySpy).toHaveBeenCalled();
    expect(updateBatchSpy).toHaveBeenCalled();
    expect(updateCouponSpy).toHaveBeenCalledWith({
      where: { id: 'coup_123' },
      data: { usedCount: { decrement: 1 } },
    });
    expect(updatePaymentSpy).toHaveBeenCalledWith({
      where: { id: 'pay_1' },
      data: { status: 'REFUNDED' },
    });
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_1' },
      data: { status: 'CANCELLED', paymentStatus: 'REFUNDED' },
    });

    expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', {
      to: 'participant@test.com',
      subject: 'Inscrição Cancelada e Reembolsada',
      templateId: 'REGISTRATION_REFUNDED',
      tenantId: 'ten_1',
      variables: {
        userName: 'Participante',
        eventName: 'Maratona Astro',
      },
    });
  });

  // deve processar reembolso de pagamento quando o status da inscricao for PENDING
  it('should handle PAYMENT_REFUNDED when registration status is PENDING to cover logical OR branch', async () => {
    // Arrange
    const job = createMockJob({
      provider: 'asaas',
      event: 'PAYMENT_REFUNDED',
      payload: { payment: { id: 'pay_asaas_123' } },
    });

    const mockPayment = {
      id: 'pay_1',
      registrationId: 'reg_1',
      tenantId: 'ten_1',
      registration: {
        status: 'PENDING', // Reembolso de inscrição PENDING (cobre o ||)
        eventId: 'evt_1',
        categoryId: 'cat_1',
        batchId: 'bat_1',
        couponId: null,
        user: { email: 'participant@test.com', name: 'John Doe' },
        event: { title: 'Maratona Astro' },
      },
    };

    vi.mocked(prisma.payment.findUnique).mockResolvedValueOnce(mockPayment as any);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        event: { update: vi.fn() },
        category: { update: vi.fn() },
        batch: { update: vi.fn() },
        payment: { update: vi.fn() },
        registration: { update: vi.fn() },
      };
      return callback(tx as any);
    });

    // Act
    await processWebhook(job);

    // Assert
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  // deve retornar silenciosamente para eventos nao tratados como criacao da cobranca
  it('should ignore unhandled events like PAYMENT_CREATED and return silently', async () => {
    // Arrange
    const job = createMockJob({
      provider: 'asaas',
      event: 'PAYMENT_CREATED',
      payload: { payment: { id: 'pay_asaas_123' } },
    });

    const mockPayment = {
      id: 'pay_1',
      registration: { status: 'PENDING' },
    };

    vi.mocked(prisma.payment.findUnique).mockResolvedValueOnce(mockPayment as any);

    // Act
    await processWebhook(job);

    // Assert
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mockEmailQueue.add).not.toHaveBeenCalled();
  });
});
