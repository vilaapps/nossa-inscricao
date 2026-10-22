import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processRegistration } from './registration.processor';
import { prisma } from '../services/prisma.service';
import { getQueue } from '../config/queues';
import { QueueName } from '@syncflow/shared';
import { Job } from 'bullmq';
import { cleanupExpiredRegistrations } from './cleanup-expired-registrations.processor';

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
      $transaction: vi.fn(),
    },
  };
});

// Mock do Cleanup Processor
vi.mock('./cleanup-expired-registrations.processor', () => {
  return {
    cleanupExpiredRegistrations: vi.fn().mockResolvedValue(undefined),
  };
});

describe('Registration Processor', () => {
  const mockQueue = getQueue(QueueName.PAYMENT);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockJob = (data: any) => {
    return {
      data,
    } as Job;
  };

  // deve delegar para cleanupExpiredRegistrations se o nome do job for cleanup-expired-registrations
  it('should delegate to cleanupExpiredRegistrations if job name is cleanup-expired-registrations', async () => {
    // Arrange
    const job = {
      name: 'cleanup-expired-registrations',
      data: {},
    } as Job;

    // Act
    await processRegistration(job);

    // Assert
    expect(cleanupExpiredRegistrations).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // deve lancar erro se o evento nao for encontrado
  it('should throw an error if the event is not found during lock', async () => {
    // Arrange
    const job = createMockJob({ eventId: 'evt_1', categoryId: 'cat_1', batchId: 'bat_1' });
    
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValueOnce([]), // Evento vazio
      };
      return callback(tx as any);
    });

    // Act & Assert
    await expect(processRegistration(job)).rejects.toThrow('Event evt_1 not found');
  });

  // deve lancar erro se a categoria nao for encontrada
  it('should throw an error if the category is not found during lock', async () => {
    // Arrange
    const job = createMockJob({ eventId: 'evt_1', categoryId: 'cat_1', batchId: 'bat_1' });
    
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([{ id: 'evt_1' }]) // Event
          .mockResolvedValueOnce([]), // Category vazia
      };
      return callback(tx as any);
    });

    // Act & Assert
    await expect(processRegistration(job)).rejects.toThrow('Category cat_1 not found');
  });

  // deve lancar erro se o lote nao for encontrado
  it('should throw an error if the batch is not found during lock', async () => {
    // Arrange
    const job = createMockJob({ eventId: 'evt_1', categoryId: 'cat_1', batchId: 'bat_1' });
    
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([{ id: 'evt_1' }]) // Event
          .mockResolvedValueOnce([{ id: 'cat_1' }]) // Category
          .mockResolvedValueOnce([]), // Batch vazio
      };
      return callback(tx as any);
    });

    // Act & Assert
    await expect(processRegistration(job)).rejects.toThrow('Batch bat_1 not found');
  });

  // deve lancar erro se a inscricao nao for encontrada
  it('should throw an error if the registration is not found', async () => {
    // Arrange
    const job = createMockJob({ eventId: 'evt_1', categoryId: 'cat_1', batchId: 'bat_1', registrationId: 'reg_1' });
    
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([{ id: 'evt_1' }]) // Event
          .mockResolvedValueOnce([{ id: 'cat_1' }]) // Category
          .mockResolvedValueOnce([{ id: 'bat_1' }]), // Batch
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(null),
        },
      };
      return callback(tx as any);
    });

    // Act & Assert
    await expect(processRegistration(job)).rejects.toThrow('Registration reg_1 not found');
  });

  // deve ignorar e retornar silenciosamente se o status da inscricao nao for QUEUED
  it('should return early and do nothing if registration status is not QUEUED', async () => {
    // Arrange
    const job = createMockJob({ eventId: 'evt_1', categoryId: 'cat_1', batchId: 'bat_1', registrationId: 'reg_1' });
    
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([{ id: 'evt_1' }])
          .mockResolvedValueOnce([{ id: 'cat_1' }])
          .mockResolvedValueOnce([{ id: 'bat_1' }]),
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce({
            id: 'reg_1',
            status: 'PENDING',
          }),
        },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert
    // O mock do queue.add não deve ter sido chamado, já que o fluxo retornou cedo
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  // deve aprovar inscricao por PIX com sucesso e diminuir vagas
  it('should approve PIX registration, deduct slots, update status to PENDING and queue payment', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_1',
      userId: 'usr_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_1',
      tenantId: 'ten_1',
    });

    const mockEvent = { id: 'evt_1', availableSlots: 10, title: 'Corrida Ficticia' };
    const mockCategory = { id: 'cat_1', availableSlots: 5 };
    const mockBatch = { id: 'bat_1', price: 100.00, maxQuantity: 20, soldQuantity: 10 };
    const mockReg = {
      id: 'reg_1',
      status: 'QUEUED',
      metadata: { paymentMethod: 'PIX', cpf: '12345678900' },
      user: { email: 'participant@test.com', name: 'John Doe' },
    };

    const updateEventSpy = vi.fn();
    const updateCategorySpy = vi.fn();
    const updateBatchSpy = vi.fn();
    const updateRegSpy = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: updateRegSpy,
        },
        event: { update: updateEventSpy },
        category: { update: updateCategorySpy },
        batch: { update: updateBatchSpy },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert
    expect(updateEventSpy).toHaveBeenCalledWith({
      where: { id: 'evt_1' },
      data: { availableSlots: 9 },
    });
    expect(updateCategorySpy).toHaveBeenCalledWith({
      where: { id: 'cat_1' },
      data: { availableSlots: 4 },
    });
    expect(updateBatchSpy).toHaveBeenCalledWith({
      where: { id: 'bat_1' },
      data: { soldQuantity: 11 },
    });
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_1' },
      data: expect.objectContaining({
        status: 'PENDING',
        amountPaid: 100.00,
        couponId: null,
      }),
    });

    expect(mockQueue.add).toHaveBeenCalledWith('process-payment', {
      registrationId: 'reg_1',
      orderId: 'reg_1',
      userId: 'usr_1',
      tenantId: 'ten_1',
      amount: 100.00,
      method: 'PIX',
      customerEmail: 'participant@test.com',
      customerName: 'John Doe',
      customerCpf: '12345678900',
    });
  });

  // deve aprovar com Credit Card e metadados ausentes com sucesso
  it('should default to PIX and empty string customer info if metadata is absent', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_1',
      userId: 'usr_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_1',
      tenantId: 'ten_1',
    });

    const mockEvent = { id: 'evt_1', availableSlots: 10 };
    const mockCategory = { id: 'cat_1', availableSlots: 5 };
    const mockBatch = { id: 'bat_1', price: 80.00, maxQuantity: null, soldQuantity: 0 };
    const mockReg = {
      id: 'reg_1',
      status: 'QUEUED',
      metadata: null,
      user: { email: 'participant@test.com', name: null },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: vi.fn(),
        },
        event: { update: vi.fn() },
        category: { update: vi.fn() },
        batch: { update: vi.fn() },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert
    expect(mockQueue.add).toHaveBeenCalledWith('process-payment', expect.objectContaining({
      method: 'PIX',
      customerName: 'Participante',
      customerCpf: '',
    }));
  });

  // deve aprovar com cartao de credito se fornecido no metadata
  it('should approve with CREDIT_CARD method when specified in registration metadata', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_1',
      userId: 'usr_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_1',
      tenantId: 'ten_1',
    });

    const mockEvent = { id: 'evt_1', availableSlots: 10 };
    const mockCategory = { id: 'cat_1', availableSlots: 5 };
    const mockBatch = { id: 'bat_1', price: 80.00, maxQuantity: null, soldQuantity: 0 };
    const mockReg = {
      id: 'reg_1',
      status: 'QUEUED',
      metadata: {
        paymentMethod: 'CREDIT_CARD',
        cardDetails: {
          holderName: 'Zezinho Card',
          number: '1234123412341234',
          expiryMonth: '10',
          expiryYear: '2030',
          ccv: '999',
        },
      },
      user: { email: 'participant@test.com', name: 'Zezinho' },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: vi.fn(),
        },
        event: { update: vi.fn() },
        category: { update: vi.fn() },
        batch: { update: vi.fn() },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert
    expect(mockQueue.add).toHaveBeenCalledWith('process-payment', {
      registrationId: 'reg_1',
      orderId: 'reg_1',
      userId: 'usr_1',
      tenantId: 'ten_1',
      amount: 80.00,
      method: 'CREDIT_CARD',
      customerEmail: 'participant@test.com',
      customerName: 'Zezinho',
      customerCpf: '',
      creditCard: {
        holderName: 'Zezinho Card',
        number: '1234123412341234',
        expiryMonth: '10',
        expiryYear: '2030',
        ccv: '999',
      },
      creditCardHolderInfo: {
        name: 'Zezinho Card',
        email: 'participant@test.com',
        cpfCnpj: '',
        postalCode: '',
        phone: '21999999999',
        addressNumber: 'S/N',
      },
    });
  });

  // deve aplicar desconto de porcentagem do cupom se for valido
  it('should apply percentage coupon discount successfully', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_1',
      userId: 'usr_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_1',
      tenantId: 'ten_1',
      couponCode: 'DESC10',
    });

    const mockEvent = { id: 'evt_1', availableSlots: 10 };
    const mockCategory = { id: 'cat_1', availableSlots: 5 };
    const mockBatch = { id: 'bat_1', price: 100.00, maxQuantity: 20, soldQuantity: 10 };
    const mockReg = {
      id: 'reg_1',
      status: 'QUEUED',
      metadata: null,
      user: { email: 'participant@test.com', name: 'John Doe' },
    };
    const mockCoupon = {
      id: 'coup_123',
      discountType: 'PERCENTAGE',
      discountValue: 15.00, // 15%
      maxUses: 100,
      usedCount: 5,
    };

    const updateRegSpy = vi.fn();
    const updateCouponSpy = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: updateRegSpy,
        },
        coupon: {
          findFirst: vi.fn().mockResolvedValueOnce(mockCoupon),
          update: updateCouponSpy,
        },
        event: { update: vi.fn() },
        category: { update: vi.fn() },
        batch: { update: vi.fn() },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert
    expect(updateCouponSpy).toHaveBeenCalledWith({
      where: { id: 'coup_123' },
      data: { usedCount: 6 },
    });
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_1' },
      data: expect.objectContaining({
        status: 'PENDING',
        amountPaid: 85.00, // 100 - 15%
        couponId: 'coup_123',
      }),
    });
  });

  // deve aplicar desconto fixo do cupom se for valido
  it('should apply fixed coupon discount successfully, ensuring amount does not go below zero', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_1',
      userId: 'usr_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_1',
      tenantId: 'ten_1',
      couponCode: 'DESCONTAO',
    });

    const mockEvent = { id: 'evt_1', availableSlots: 10 };
    const mockCategory = { id: 'cat_1', availableSlots: 5 };
    const mockBatch = { id: 'bat_1', price: 30.00, maxQuantity: null, soldQuantity: 0 };
    const mockReg = {
      id: 'reg_1',
      status: 'QUEUED',
      metadata: null,
      user: { email: 'participant@test.com', name: 'John Doe' },
    };
    const mockCoupon = {
      id: 'coup_123',
      discountType: 'FIXED',
      discountValue: 50.00, // Desconto de 50 reais num ingresso de 30
      maxUses: null,
      usedCount: 0,
    };

    const updateRegSpy = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: updateRegSpy,
        },
        coupon: {
          findFirst: vi.fn().mockResolvedValueOnce(mockCoupon),
          update: vi.fn(),
        },
        event: { update: vi.fn() },
        category: { update: vi.fn() },
        batch: { update: vi.fn() },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_1' },
      data: expect.objectContaining({
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        amountPaid: 0,
        couponId: 'coup_123',
      }),
    });
  });

  // deve ignorar cupom caso o mesmo nao seja encontrado ou esteja esgotado
  it('should ignore coupon if coupon is not found or has exceeded max uses', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_1',
      userId: 'usr_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_1',
      tenantId: 'ten_1',
      couponCode: 'ESGOTADO',
    });

    const mockEvent = { id: 'evt_1', availableSlots: 10 };
    const mockCategory = { id: 'cat_1', availableSlots: 5 };
    const mockBatch = { id: 'bat_1', price: 100.00, maxQuantity: null, soldQuantity: 0 };
    const mockReg = {
      id: 'reg_1',
      status: 'QUEUED',
      metadata: null,
      user: { email: 'participant@test.com', name: 'John Doe' },
    };

    // Caso onde o cupom excedeu max uses
    const mockExceededCoupon = {
      id: 'coup_exceeded',
      discountType: 'PERCENTAGE',
      discountValue: 20.00,
      maxUses: 10,
      usedCount: 10, // ESGOTADO
    };

    const updateRegSpy = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: updateRegSpy,
        },
        coupon: {
          findFirst: vi.fn().mockResolvedValueOnce(mockExceededCoupon),
        },
        event: { update: vi.fn() },
        category: { update: vi.fn() },
        batch: { update: vi.fn() },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert
    // Deve ignorar o cupom e cobrar o valor cheio
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_1' },
      data: expect.objectContaining({
        status: 'PENDING',
        amountPaid: 100.00,
        couponId: null,
      }),
    });
  });

  // deve rejeitar inscricao se o Evento estiver sem vagas
  it('should reject registration if Event available slots are exhausted', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_1',
      userId: 'usr_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_1',
      tenantId: 'ten_1',
    });

    const mockEvent = { id: 'evt_1', availableSlots: 0, title: 'Corrida de Teste' }; // Evento ESGOTADO
    const mockCategory = { id: 'cat_1', availableSlots: 5 };
    const mockBatch = { id: 'bat_1', price: 100.00, maxQuantity: null, soldQuantity: 0 };
    const mockReg = {
      id: 'reg_1',
      status: 'QUEUED',
      metadata: null,
      user: { email: 'participant@test.com', name: 'John Doe' },
    };

    const updateRegSpy = vi.fn();
    const mockEmailQueue = getQueue(QueueName.EMAIL);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: updateRegSpy,
        },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_1' },
      data: { status: 'REJECTED' },
    });

    expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', {
      to: 'participant@test.com',
      subject: 'Inscrição Não Concluída - Vagas Esgotadas',
      templateId: 'REGISTRATION_REJECTED_OUT_OF_SLOTS',
      tenantId: 'ten_1',
      variables: {
        userName: 'John Doe',
        eventName: 'Corrida de Teste',
      },
    });
  });

  // deve rejeitar inscricao se a Categoria estiver sem vagas
  it('should reject registration if Category available slots are exhausted', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_1',
      userId: 'usr_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_1',
      tenantId: 'ten_1',
    });

    const mockEvent = { id: 'evt_1', availableSlots: 10, title: 'Corrida de Teste' };
    const mockCategory = { id: 'cat_1', availableSlots: 0 }; // Categoria ESGOTADA
    const mockBatch = { id: 'bat_1', price: 100.00, maxQuantity: null, soldQuantity: 0 };
    const mockReg = {
      id: 'reg_1',
      status: 'QUEUED',
      metadata: null,
      user: { email: 'participant@test.com', name: null },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: vi.fn(),
        },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert
    expect(getQueue(QueueName.EMAIL).add).toHaveBeenCalled();
  });

  // deve rejeitar inscricao se o Lote estiver sem vagas
  it('should reject registration if Batch capacity is exhausted', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_1',
      userId: 'usr_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_1',
      tenantId: 'ten_1',
    });

    const mockEvent = { id: 'evt_1', availableSlots: 10, title: 'Corrida de Teste' };
    const mockCategory = { id: 'cat_1', availableSlots: 5 };
    const mockBatch = { id: 'bat_1', price: 100.00, maxQuantity: 10, soldQuantity: 10 }; // Lote ESGOTADO
    const mockReg = {
      id: 'reg_1',
      status: 'QUEUED',
      metadata: null,
      user: { email: 'participant@test.com', name: 'John Doe' },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: vi.fn(),
        },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert
    expect(getQueue(QueueName.EMAIL).add).toHaveBeenCalled();
  });

  // deve calcular taxa administrativa e acrescer ao valor final pago (Taxa de Conveniência/Administrativa)
  it('should calculate administrative fee and add to amountPaid and payment queue amount', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_fee_1',
      userId: 'usr_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_1',
      tenantId: 'ten_1',
    });

    const mockEvent = { id: 'evt_1', availableSlots: 10, title: 'Corrida Ficticia' };
    const mockCategory = { id: 'cat_1', availableSlots: 5 };
    const mockBatch = { id: 'bat_1', price: 100.00, maxQuantity: 20, soldQuantity: 10 };
    const mockReg = {
      id: 'reg_fee_1',
      status: 'QUEUED',
      metadata: { paymentMethod: 'PIX', cpf: '12345678900' },
      user: { email: 'participant@test.com', name: 'John Doe' },
    };

    const updateRegSpy = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        tenant: {
          findUnique: vi.fn().mockResolvedValueOnce({ id: 'ten_1', commissionRate: 10.00 }),
        },
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: updateRegSpy,
        },
        event: { update: vi.fn() },
        category: { update: vi.fn() },
        batch: { update: vi.fn() },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert: Lote R$ 100 + 10% Taxa Administrativa = R$ 110
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_fee_1' },
      data: {
        status: 'PENDING',
        amountPaid: 110.00,
        couponId: null,
        receiptCode: expect.any(String),
        metadata: {
          paymentMethod: 'PIX',
          cpf: '12345678900',
          subtotal: 100.00,
          adminFee: 10.00,
          commissionRate: 10.00,
          receiptCode: expect.any(String),
        },
      },
    });

    expect(mockQueue.add).toHaveBeenCalledWith('process-payment', expect.objectContaining({
      registrationId: 'reg_fee_1',
      amount: 110.00,
    }));
  });

  // deve calcular taxa administrativa sobre o valor com desconto de cupom (Decisão P0.2 - Opção A)
  it('should calculate administrative fee on discounted coupon price (Decision P0.2 - Option A)', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_fee_coupon',
      userId: 'usr_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_1',
      tenantId: 'ten_1',
      couponCode: 'DESC20',
    });

    const mockEvent = { id: 'evt_1', availableSlots: 10, title: 'Corrida Ficticia' };
    const mockCategory = { id: 'cat_1', availableSlots: 5 };
    const mockBatch = { id: 'bat_1', price: 100.00, maxQuantity: 20, soldQuantity: 10 };
    const mockCoupon = { id: 'cupom_20', discountType: 'PERCENTAGE', discountValue: 20.00, maxUses: 10, usedCount: 0 };
    const mockReg = {
      id: 'reg_fee_coupon',
      status: 'QUEUED',
      metadata: { paymentMethod: 'PIX', cpf: '12345678900' },
      user: { email: 'participant@test.com', name: 'John Doe' },
    };

    const updateRegSpy = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        coupon: {
          findFirst: vi.fn().mockResolvedValueOnce(mockCoupon),
          update: vi.fn(),
        },
        tenant: {
          findUnique: vi.fn().mockResolvedValueOnce({ id: 'ten_1', commissionRate: 10.00 }),
        },
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: updateRegSpy,
        },
        event: { update: vi.fn() },
        category: { update: vi.fn() },
        batch: { update: vi.fn() },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert: Lote R$ 100 - 20% = R$ 80 subtotal. Taxa 10% de R$ 80 = R$ 8. Total pago = R$ 88.
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_fee_coupon' },
      data: {
        status: 'PENDING',
        amountPaid: 88.00,
        couponId: 'cupom_20',
        receiptCode: expect.any(String),
        metadata: {
          paymentMethod: 'PIX',
          cpf: '12345678900',
          subtotal: 80.00,
          adminFee: 8.00,
          commissionRate: 10.00,
          receiptCode: expect.any(String),
        },
      },
    });

    expect(mockQueue.add).toHaveBeenCalledWith('process-payment', expect.objectContaining({
      registrationId: 'reg_fee_coupon',
      amount: 88.00,
    }));
  });

  // deve tratar evento gratuito (lote R$ 0) confirmando imediatamente sem chamar fila de pagamento
  it('should treat free event (batch price 0) confirming immediately without payment queue', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_free_1',
      userId: 'usr_1',
      eventId: 'evt_free',
      categoryId: 'cat_free',
      batchId: 'bat_free',
      tenantId: 'ten_1',
    });

    const mockEvent = { id: 'evt_free', availableSlots: 50, title: 'Treinão Social' };
    const mockCategory = { id: 'cat_free', availableSlots: 50 };
    const mockBatch = { id: 'bat_free', price: 0, maxQuantity: 50, soldQuantity: 0 };
    const mockReg = {
      id: 'reg_free_1',
      status: 'QUEUED',
      metadata: { paymentMethod: 'PIX', cpf: '12345678900' },
      user: { email: 'free@test.com', name: 'Atleta Social' },
    };

    const updateRegSpy = vi.fn();
    const mockEmailQueue = getQueue(QueueName.EMAIL);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        tenant: {
          findUnique: vi.fn().mockResolvedValueOnce({ id: 'ten_1', commissionRate: 10.00 }),
        },
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: updateRegSpy,
        },
        event: { update: vi.fn() },
        category: { update: vi.fn() },
        batch: { update: vi.fn() },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_free_1' },
      data: expect.objectContaining({
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        amountPaid: 0,
        receiptCode: expect.any(String),
      }),
    });

    // Fila de pagamento NUNCA deve ser chamada
    expect(mockQueue.add).not.toHaveBeenCalledWith('process-payment', expect.anything());
    // Fila de e-mail deve ser chamada para confirmação
    expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', expect.objectContaining({
      templateId: 'REGISTRATION_CONFIRMED',
      to: 'free@test.com',
    }));
  });

  // deve confirmar inscrição gratuita com kit e anexar PDF gerado
  it('should confirm free registration with kit and attach generated PDF', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_free_kit',
      userId: 'usr_1',
      eventId: 'evt_free_kit',
      categoryId: 'cat_free_kit',
      batchId: 'bat_free_kit',
      tenantId: 'ten_1',
    });

    const mockEvent = {
      id: 'evt_free_kit',
      availableSlots: 50,
      title: 'Treinão com Kit',
      date: new Date('2026-11-20'),
      location: 'Parque Central',
      hasKit: true,
    };
    const mockCategory = { id: 'cat_free_kit', availableSlots: 50, name: '5KM' };
    const mockBatch = { id: 'bat_free_kit', price: 0, maxQuantity: 50, soldQuantity: 0, name: 'Lote 1' };
    const mockReg = {
      id: 'reg_free_kit',
      status: 'QUEUED',
      metadata: { paymentMethod: 'PIX', shirtSize: 'GG', cpf: '12345678900' },
      user: { email: 'free_kit@test.com', name: 'Atleta com Kit', cpf: '12345678900' },
      athleteBirthDate: new Date('1990-01-01'),
      athleteGender: 'F',
    };

    const updateRegSpy = vi.fn();
    const mockEmailQueue = getQueue(QueueName.EMAIL);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        tenant: {
          findUnique: vi.fn().mockResolvedValueOnce({ id: 'ten_1', commissionRate: 10.00 }),
        },
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: updateRegSpy,
        },
        event: { update: vi.fn() },
        category: { update: vi.fn() },
        batch: { update: vi.fn() },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_free_kit' },
      data: expect.objectContaining({
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        amountPaid: 0,
      }),
    });
    expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', expect.objectContaining({
      templateId: 'REGISTRATION_CONFIRMED',
      to: 'free_kit@test.com',
      attachments: expect.arrayContaining([
        expect.objectContaining({
          filename: expect.stringMatching(/^comprovante-.*\.pdf$/),
          content: expect.any(String),
        }),
      ]),
    }));
  });

  // deve confirmar inscrição gratuita e enviar e-mail mesmo se a geração de PDF falhar
  it('should confirm free registration and enqueue email without attachment if renderReceiptPdf fails', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_free_pdf_fail',
      userId: 'usr_1',
      eventId: 'evt_free',
      categoryId: 'cat_free',
      batchId: 'bat_free',
      tenantId: 'ten_1',
    });

    const mockEvent = { id: 'evt_free', availableSlots: 50, title: 'Treinão Social', hasKit: true };
    const mockCategory = { id: 'cat_free', availableSlots: 50, name: 'Geral' };
    const mockBatch = { id: 'bat_free', price: 0, maxQuantity: 50, soldQuantity: 0, name: 'Lote 1' };
    const mockReg = {
      id: 'reg_free_pdf_fail',
      status: 'QUEUED',
      metadata: { paymentMethod: 'PIX', complementaryData: { shirtSize: 'M' } },
      user: { email: 'free_fail@test.com', name: null, cpf: null },
      athleteBirthDate: new Date('1995-05-10'),
      athleteGender: 'M',
    };

    const updateRegSpy = vi.fn();
    const mockEmailQueue = getQueue(QueueName.EMAIL);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        tenant: {
          findUnique: vi.fn().mockResolvedValueOnce({ id: 'ten_1', commissionRate: 10.00 }),
        },
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: updateRegSpy,
        },
        event: { update: vi.fn() },
        category: { update: vi.fn() },
        batch: { update: vi.fn() },
      };
      return callback(tx as any);
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sharedModule = await import('@syncflow/shared');
    const renderSpy = vi.spyOn(sharedModule, 'renderReceiptPdf').mockRejectedValueOnce(new Error('PDF Kit crashed'));

    // Act
    await processRegistration(job);

    // Assert
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_free_pdf_fail' },
      data: expect.objectContaining({
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        amountPaid: 0,
      }),
    });
    expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', expect.objectContaining({
      templateId: 'REGISTRATION_CONFIRMED',
      to: 'free_fail@test.com',
      attachments: undefined,
    }));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RegistrationProcessor] Falha ao gerar PDF de comprovante:'),
      expect.any(Error)
    );

    renderSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // deve respeitar override de taxa administrativa do evento = 0% mesmo com tenant a 10%
  it('should respect event adminFeeRate override of 0% over tenant commissionRate of 10%', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_fee_override_zero',
      userId: 'usr_1',
      eventId: 'evt_override',
      categoryId: 'cat_1',
      batchId: 'bat_1',
      tenantId: 'ten_1',
    });

    const mockEvent = {
      id: 'evt_override',
      availableSlots: 10,
      title: 'Desafio Sem Taxa',
      adminFeeRate: 0, // Override explícito de 0%
    };
    const mockCategory = { id: 'cat_1', availableSlots: 5 };
    const mockBatch = { id: 'bat_1', price: 100.00, maxQuantity: 20, soldQuantity: 0 };
    const mockReg = {
      id: 'reg_fee_override_zero',
      status: 'QUEUED',
      metadata: { paymentMethod: 'PIX', cpf: '12345678900' },
      user: { email: 'participant@test.com', name: 'John Doe' },
    };

    const updateRegSpy = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        tenant: {
          findUnique: vi.fn().mockResolvedValueOnce({ id: 'ten_1', commissionRate: 10.00 }),
        },
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: updateRegSpy,
        },
        event: { update: vi.fn() },
        category: { update: vi.fn() },
        batch: { update: vi.fn() },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert: Taxa 0% -> adminFee: 0, total: 100
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_fee_override_zero' },
      data: expect.objectContaining({
        status: 'PENDING',
        amountPaid: 100.00,
        metadata: expect.objectContaining({
          adminFee: 0,
          commissionRate: 0,
          subtotal: 100.00,
        }),
      }),
    });
  });

  // deve rejeitar inscrição e notificar lote encerrado se o lote por data expirou
  it('should reject registration and send REGISTRATION_BATCH_CLOSED if DATE batch has expired', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_batch_expired',
      userId: 'usr_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_expired',
      tenantId: 'ten_1',
    });

    const mockEvent = { id: 'evt_1', availableSlots: 10, title: 'Corrida' };
    const mockCategory = { id: 'cat_1', availableSlots: 5 };
    const mockBatch = {
      id: 'bat_expired',
      name: '1º Lote Expirado',
      type: 'DATE',
      price: 50.00,
      endDate: new Date(Date.now() - 10000), // Expirou no passado
      maxQuantity: null,
      soldQuantity: 5,
    };
    const mockReg = {
      id: 'reg_batch_expired',
      status: 'QUEUED',
      user: { email: 'expired@test.com', name: 'Atleta Atrasado' },
    };

    const updateRegSpy = vi.fn();
    const eventUpdateSpy = vi.fn();
    const mockEmailQueue = getQueue(QueueName.EMAIL);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: updateRegSpy,
        },
        event: { update: eventUpdateSpy },
        category: { update: vi.fn() },
        batch: { update: vi.fn() },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert: inscrição rejeitada e vagas NÃO deduzidas
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_batch_expired' },
      data: { status: 'REJECTED' },
    });
    expect(eventUpdateSpy).not.toHaveBeenCalled();
    expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', expect.objectContaining({
      templateId: 'REGISTRATION_BATCH_CLOSED',
      to: 'expired@test.com',
    }));
  });

  // deve rejeitar inscrição e notificar lote encerrado com nome fallback se o lote por quantidade esgotou
  it('should reject registration and send REGISTRATION_BATCH_CLOSED when QUANTITY batch is sold out with fallback name', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_batch_sold_out',
      userId: 'usr_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_sold_out',
      tenantId: 'ten_1',
    });

    const mockEvent = { id: 'evt_1', availableSlots: 10, title: 'Corrida' };
    const mockCategory = { id: 'cat_1', availableSlots: 5 };
    const mockBatch = {
      id: 'bat_sold_out',
      name: 'Lote Esgotado',
      type: 'QUANTITY',
      price: 50.00,
      maxQuantity: 20,
      soldQuantity: 20, // soldQuantity >= maxQuantity
    };
    const mockReg = {
      id: 'reg_batch_sold_out',
      status: 'QUEUED',
      user: { email: 'noname@test.com', name: null }, // nome nulo -> fallback 'Participante'
    };

    const updateRegSpy = vi.fn();
    const eventUpdateSpy = vi.fn();
    const mockEmailQueue = getQueue(QueueName.EMAIL);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: updateRegSpy,
        },
        event: { update: eventUpdateSpy },
        category: { update: vi.fn() },
        batch: { update: vi.fn() },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_batch_sold_out' },
      data: { status: 'REJECTED' },
    });
    expect(eventUpdateSpy).not.toHaveBeenCalled();
    expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', expect.objectContaining({
      templateId: 'REGISTRATION_BATCH_CLOSED',
      to: 'noname@test.com',
      variables: expect.objectContaining({
        userName: 'Participante',
      }),
    }));
  });

  // deve usar fallback de nome de participante no e-mail de evento gratuito
  it('should use fallback name when participant has no name in free event confirmation', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_free_no_name',
      userId: 'usr_1',
      eventId: 'evt_free',
      categoryId: 'cat_free',
      batchId: 'bat_free',
      tenantId: 'ten_1',
    });

    const mockEvent = { id: 'evt_free', availableSlots: 10, title: 'Treinão' };
    const mockCategory = { id: 'cat_free', availableSlots: 10 };
    const mockBatch = { id: 'bat_free', price: 0, maxQuantity: 50, soldQuantity: 0 };
    const mockReg = {
      id: 'reg_free_no_name',
      status: 'QUEUED',
      metadata: { paymentMethod: 'PIX' },
      user: { email: 'noname@test.com', name: null },
    };

    const mockEmailQueue = getQueue(QueueName.EMAIL);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        tenant: {
          findUnique: vi.fn().mockResolvedValueOnce({ id: 'ten_1', commissionRate: 0 }),
        },
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: vi.fn(),
        },
        event: { update: vi.fn() },
        category: { update: vi.fn() },
        batch: { update: vi.fn() },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert
    expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', expect.objectContaining({
      variables: expect.objectContaining({
        athleteName: 'Participante',
      }),
    }));
  });

  // deve rejeitar inscrição e enviar e-mail REGISTRATION_BATCH_NOT_STARTED se o lote ainda não abriu
  it('should reject registration and send REGISTRATION_BATCH_NOT_STARTED if batch has not started', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_not_started',
      userId: 'usr_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_not_started',
      tenantId: 'ten_1',
    });

    const mockEvent = {
      id: 'evt_1',
      title: 'Treinão Futuro',
      availableSlots: 50,
      registrationOpensAt: null,
    };
    const mockCategory = { id: 'cat_1', availableSlots: 20 };
    const mockBatch = {
      id: 'bat_not_started',
      name: 'Lote Futuro',
      type: 'DATE',
      startDate: new Date(Date.now() + 86400000 * 2),
      endDate: new Date(Date.now() + 86400000 * 10),
      soldQuantity: 0,
      maxQuantity: 100,
      price: 100,
    };
    const mockReg = {
      id: 'reg_not_started',
      status: 'QUEUED',
      user: { email: 'athlete@test.com', name: null },
      metadata: {},
    };

    const updateRegSpy = vi.fn();
    const mockEmailQueue = getQueue(QueueName.EMAIL);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: updateRegSpy,
        },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_not_started' },
      data: { status: 'REJECTED' },
    });
    expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', expect.objectContaining({
      to: 'athlete@test.com',
      templateId: 'REGISTRATION_BATCH_NOT_STARTED',
      variables: expect.objectContaining({
        userName: 'Participante',
      }),
    }));
  });

  // deve rejeitar inscrição se as inscrições do evento ainda não abriram
  it('should reject registration if event registrationOpensAt is in the future', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_event_not_started',
      userId: 'usr_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_1',
      tenantId: 'ten_1',
    });

    const mockEvent = {
      id: 'evt_1',
      title: 'Treinão Futuro',
      availableSlots: 50,
      registrationOpensAt: new Date(Date.now() + 86400000 * 5),
    };
    const mockCategory = { id: 'cat_1', availableSlots: 20 };
    const mockBatch = {
      id: 'bat_1',
      name: 'Lote 1',
      type: 'QUANTITY',
      soldQuantity: 0,
      maxQuantity: 100,
      price: 100,
    };
    const mockReg = {
      id: 'reg_event_not_started',
      status: 'QUEUED',
      user: { email: 'athlete@test.com', name: 'Atleta' },
      metadata: {},
    };

    const updateRegSpy = vi.fn();
    const mockEmailQueue = getQueue(QueueName.EMAIL);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: updateRegSpy,
        },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_event_not_started' },
      data: { status: 'REJECTED' },
    });
    expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', expect.objectContaining({
      to: 'athlete@test.com',
      templateId: 'REGISTRATION_BATCH_NOT_STARTED',
    }));
  });

  // deve rejeitar inscrição se o evento não estiver publicado
  it('should reject registration if event is not PUBLISHED in worker', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_draft',
      userId: 'usr_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_1',
      tenantId: 'ten_1',
    });

    const mockEvent = {
      id: 'evt_1',
      title: 'Treinão Rascunho',
      status: 'DRAFT',
      availableSlots: 50,
    };
    const mockCategory = { id: 'cat_1', availableSlots: 20 };
    const mockBatch = {
      id: 'bat_1',
      name: 'Lote 1',
      type: 'QUANTITY',
      soldQuantity: 0,
      maxQuantity: 100,
      price: 100,
    };
    const mockReg = {
      id: 'reg_draft',
      status: 'QUEUED',
      user: { email: 'athlete@test.com', name: 'Atleta' },
      metadata: {},
    };

    const updateRegSpy = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([mockEvent])
          .mockResolvedValueOnce([mockCategory])
          .mockResolvedValueOnce([mockBatch]),
        registration: {
          findUnique: vi.fn().mockResolvedValueOnce(mockReg),
          update: updateRegSpy,
        },
      };
      return callback(tx as any);
    });

    // Act
    await processRegistration(job);

    // Assert
    expect(updateRegSpy).toHaveBeenCalledWith({
      where: { id: 'reg_draft' },
      data: { status: 'REJECTED' },
    });
  });
});
