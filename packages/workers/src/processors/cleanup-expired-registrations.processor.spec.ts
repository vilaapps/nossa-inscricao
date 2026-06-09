import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanupExpiredRegistrations } from './cleanup-expired-registrations.processor';
import { prisma } from '../services/prisma.service';
import { asaasService } from '../services/asaas.service';
import { getQueue } from '../config/queues';
import { QueueName } from '@syncflow/shared';

// Mock Queue QueueName.EMAIL
vi.mock('../config/queues', () => {
  const mockAdd = vi.fn().mockResolvedValue({ id: 'email-job-id' });
  const mockQueue = { add: mockAdd };
  return {
    getQueue: vi.fn().mockReturnValue(mockQueue),
  };
});

// Mock Prisma
vi.mock('../services/prisma.service', () => {
  return {
    prisma: {
      $transaction: vi.fn(),
      registration: {
        findMany: vi.fn(),
      },
    },
  };
});

// Mock AsaasService
vi.mock('../services/asaas.service', () => {
  return {
    asaasService: {
      deletePayment: vi.fn(),
    },
  };
});

describe('cleanupExpiredRegistrations Processor', () => {
  const mockEmailQueue = getQueue(QueueName.EMAIL);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // não deve expirar inscrições que ainda estão dentro do prazo de vencimento
  it('should not expire registrations that are still within the expiration window', async () => {
    // Arrange
    const now = new Date();
    const mockRegistration = {
      id: 'reg_active',
      status: 'PENDING',
      paymentStatus: 'PENDING',
      createdAt: now, // created just now
      batch: {
        expirationTimeMinutes: 60,
      },
      payment: null,
      user: { email: 'user@test.com', name: 'John Doe' },
      event: { title: 'Running Event' },
    };

    vi.mocked(prisma.registration.findMany).mockResolvedValueOnce([mockRegistration as any]);

    // Act
    await cleanupExpiredRegistrations();

    // Assert
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(asaasService.deletePayment).not.toHaveBeenCalled();
    expect(mockEmailQueue.add).not.toHaveBeenCalled();
  });

  // deve expirar inscrições atrasadas com sucesso, cancelando pagamento no Asaas e revertendo vagas
  it('should expire overdue registrations, delete payment on Asaas, revert capacities and send email', async () => {
    // Arrange
    const overdueTime = new Date(Date.now() - 65 * 60 * 1000); // 65 minutes ago
    const mockRegistration = {
      id: 'reg_overdue',
      tenantId: 'tenant_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_1',
      couponId: 'coup_1',
      status: 'PENDING',
      paymentStatus: 'PENDING',
      createdAt: overdueTime,
      batch: {
        id: 'bat_1',
        expirationTimeMinutes: 60,
      },
      payment: {
        id: 'pay_1',
        gatewayPaymentId: 'asaas_pay_123',
      },
      user: { email: 'user@test.com', name: 'John Doe' },
      event: { title: 'Running Event' },
    };

    vi.mocked(prisma.registration.findMany).mockResolvedValueOnce([mockRegistration as any]);
    vi.mocked(asaasService.deletePayment).mockResolvedValueOnce(undefined);

    const mockEventUpdate = vi.fn();
    const mockCategoryUpdate = vi.fn();
    const mockBatchUpdate = vi.fn();
    const mockCouponUpdate = vi.fn();
    const mockPaymentUpdate = vi.fn();
    const mockRegistrationUpdate = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        event: { update: mockEventUpdate },
        category: { update: mockCategoryUpdate },
        batch: { update: mockBatchUpdate },
        coupon: { update: mockCouponUpdate },
        payment: { update: mockPaymentUpdate },
        registration: { update: mockRegistrationUpdate },
      };
      return callback(tx as any);
    });

    // Act
    await cleanupExpiredRegistrations();

    // Assert
    expect(asaasService.deletePayment).toHaveBeenCalledWith('asaas_pay_123');

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(mockEventUpdate).toHaveBeenCalledWith({
      where: { id: 'evt_1' },
      data: { availableSlots: { increment: 1 } },
    });
    expect(mockCategoryUpdate).toHaveBeenCalledWith({
      where: { id: 'cat_1' },
      data: { availableSlots: { increment: 1 } },
    });
    expect(mockBatchUpdate).toHaveBeenCalledWith({
      where: { id: 'bat_1' },
      data: { soldQuantity: { decrement: 1 } },
    });
    expect(mockCouponUpdate).toHaveBeenCalledWith({
      where: { id: 'coup_1' },
      data: { usedCount: { decrement: 1 } },
    });
    expect(mockPaymentUpdate).toHaveBeenCalledWith({
      where: { id: 'pay_1' },
      data: { status: 'FAILED' },
    });
    expect(mockRegistrationUpdate).toHaveBeenCalledWith({
      where: { id: 'reg_overdue' },
      data: {
        status: 'EXPIRED',
        paymentStatus: 'CANCELLED',
      },
    });

    expect(mockEmailQueue.add).toHaveBeenCalledWith(
      'send-email',
      expect.objectContaining({
        to: 'user@test.com',
        subject: 'Sua inscrição expirou',
        templateId: 'REGISTRATION_EXPIRED',
        tenantId: 'tenant_1',
        variables: {
          userName: 'John Doe',
          eventName: 'Running Event',
        },
      })
    );
  });

  // deve pular a expiração da inscrição local se a exclusão do pagamento no Asaas falhar
  it('should skip local registration expiration if Asaas payment deletion fails', async () => {
    // Arrange
    const overdueTime = new Date(Date.now() - 65 * 60 * 1000);
    const mockRegistration = {
      id: 'reg_overdue',
      status: 'PENDING',
      paymentStatus: 'PENDING',
      createdAt: overdueTime,
      batch: {
        expirationTimeMinutes: 60,
      },
      payment: {
        id: 'pay_1',
        gatewayPaymentId: 'asaas_pay_123',
      },
      user: { email: 'user@test.com', name: 'John Doe' },
      event: { title: 'Running Event' },
    };

    vi.mocked(prisma.registration.findMany).mockResolvedValueOnce([mockRegistration as any]);
    vi.mocked(asaasService.deletePayment).mockRejectedValueOnce(new Error('Payment cannot be deleted (e.g. already paid)'));

    // Act
    await cleanupExpiredRegistrations();

    // Assert
    expect(asaasService.deletePayment).toHaveBeenCalledWith('asaas_pay_123');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mockEmailQueue.add).not.toHaveBeenCalled();
  });

  // deve expirar inscrição atrasada sem detalhes de pagamento/cupom e usar valores padrão
  it('should expire overdue registration with no payment/coupon and fallback to default name/expiration', async () => {
    // Arrange
    const overdueTime = new Date(Date.now() - 65 * 60 * 1000);
    const mockRegistration = {
      id: 'reg_simple',
      tenantId: 'tenant_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_1',
      couponId: null, // Test branch: no coupon
      status: 'PENDING',
      paymentStatus: 'PENDING',
      createdAt: overdueTime,
      batch: {
        id: 'bat_1',
        expirationTimeMinutes: null, // Test branch: null expiration (defaults to 60)
      },
      payment: null, // Test branch: no payment
      user: { email: 'user@test.com', name: null }, // Test branch: null name (defaults to Participante)
      event: { title: 'Running Event' },
    };

    vi.mocked(prisma.registration.findMany).mockResolvedValueOnce([mockRegistration as any]);
    
    const mockEventUpdate = vi.fn();
    const mockCategoryUpdate = vi.fn();
    const mockBatchUpdate = vi.fn();
    const mockRegistrationUpdate = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        event: { update: mockEventUpdate },
        category: { update: mockCategoryUpdate },
        batch: { update: mockBatchUpdate },
        registration: { update: mockRegistrationUpdate },
      };
      return callback(tx as any);
    });

    // Act
    await cleanupExpiredRegistrations();

    // Assert
    expect(asaasService.deletePayment).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(mockEventUpdate).toHaveBeenCalledWith({
      where: { id: 'evt_1' },
      data: { availableSlots: { increment: 1 } },
    });
    expect(mockCategoryUpdate).toHaveBeenCalledWith({
      where: { id: 'cat_1' },
      data: { availableSlots: { increment: 1 } },
    });
    expect(mockBatchUpdate).toHaveBeenCalledWith({
      where: { id: 'bat_1' },
      data: { soldQuantity: { decrement: 1 } },
    });
    
    expect(mockEmailQueue.add).toHaveBeenCalledWith(
      'send-email',
      expect.objectContaining({
        to: 'user@test.com',
        variables: {
          userName: 'Participante', // fallback used
          eventName: 'Running Event',
        },
      })
    );
  });

  // deve capturar e registrar erros caso ocorra uma falha geral no fluxo de expiração
  it('should catch and log error if transaction fails during expiration process', async () => {
    // Arrange
    const overdueTime = new Date(Date.now() - 65 * 60 * 1000);
    const mockRegistration = {
      id: 'reg_error',
      tenantId: 'tenant_1',
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_1',
      couponId: null,
      status: 'PENDING',
      paymentStatus: 'PENDING',
      createdAt: overdueTime,
      batch: {
        id: 'bat_1',
        expirationTimeMinutes: 60,
      },
      payment: null,
      user: { email: 'user@test.com', name: 'John' },
      event: { title: 'Running Event' },
    };

    vi.mocked(prisma.registration.findMany).mockResolvedValueOnce([mockRegistration as any]);
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error('Database error'));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act
    await cleanupExpiredRegistrations();

    // Assert
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Cleanup] Error processing expiration for registration reg_error:'),
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });
});
