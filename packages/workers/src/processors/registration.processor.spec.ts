import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processRegistration } from './registration.processor';
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
      $transaction: vi.fn(),
    },
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
      data: {
        status: 'PENDING',
        amountPaid: 100.00,
        couponId: null,
      },
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
      metadata: { paymentMethod: 'CREDIT_CARD', cpf: '99999999999' },
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
    expect(mockQueue.add).toHaveBeenCalledWith('process-payment', expect.objectContaining({
      method: 'CREDIT_CARD',
      customerName: 'Zezinho',
      customerCpf: '99999999999',
    }));
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
      data: {
        status: 'PENDING',
        amountPaid: 85.00, // 100 - 15%
        couponId: 'coup_123',
      },
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
      data: {
        status: 'PENDING',
        amountPaid: 0, // Minimo zero
        couponId: 'coup_123',
      },
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
      data: {
        status: 'PENDING',
        amountPaid: 100.00,
        couponId: null,
      },
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
});
