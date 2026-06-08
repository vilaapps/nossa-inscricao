import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processPayment } from './payment.processor';
import { prisma } from '../services/prisma.service';
import { asaasService } from '../services/asaas.service';
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
      tenant: {
        findUnique: vi.fn(),
      },
      payment: {
        upsert: vi.fn(),
      },
    },
  };
});

// Mock do Asaas Service
vi.mock('../services/asaas.service', () => {
  return {
    asaasService: {
      createCustomer: vi.fn(),
      createPayment: vi.fn(),
      getPixQrCode: vi.fn(),
    },
  };
});

describe('Payment Processor', () => {
  const mockEmailQueue = getQueue(QueueName.EMAIL);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockJob = (data: any) => {
    return {
      data,
    } as Job;
  };

  // deve lancar erro se o tenant nao for encontrado
  it('should throw an error if the tenant does not exist', async () => {
    // Arrange
    const job = createMockJob({ tenantId: 'ten_none' });
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(null);

    // Act & Assert
    await expect(processPayment(job)).rejects.toThrow('Asaas API Key not configured for tenant ten_none');
  });

  // deve lancar erro se a chave do Asaas nao estiver configurada
  it('should throw an error if the tenant asaasApiKey is missing', async () => {
    // Arrange
    const job = createMockJob({ tenantId: 'ten_1' });
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce({
      id: 'ten_1',
      asaasApiKey: null,
    } as any);

    // Act & Assert
    await expect(processPayment(job)).rejects.toThrow('Asaas API Key not configured for tenant ten_1');
  });

  // deve processar pagamento via PIX com sucesso
  it('should process payment via PIX, upsert DB record and schedule instructions email', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_1',
      tenantId: 'ten_1',
      amount: 150.00,
      method: 'PIX',
      customerEmail: 'customer@test.com',
      customerName: 'Astro Customer',
      customerCpf: '123.456.789-00',
    });

    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce({
      id: 'ten_1',
      asaasApiKey: 'key_123',
    } as any);

    vi.mocked(asaasService.createCustomer).mockResolvedValueOnce('cus_123');
    vi.mocked(asaasService.createPayment).mockResolvedValueOnce({ id: 'pay_asaas_123' });
    vi.mocked(asaasService.getPixQrCode).mockResolvedValueOnce({
      payload: 'pix-copia-e-cola-code',
      expirationDate: '2026-06-08T23:59:59.000Z',
    });

    // Act
    await processPayment(job);

    // Assert
    expect(asaasService.createCustomer).toHaveBeenCalledWith({
      name: 'Astro Customer',
      email: 'customer@test.com',
      cpfCnpj: '123.456.789-00',
    }, 'key_123');

    expect(asaasService.createPayment).toHaveBeenCalledWith({
      customerId: 'cus_123',
      billingType: 'PIX',
      value: 150.00,
      dueDate: expect.any(String),
      externalReference: 'reg_1',
    }, 'key_123');

    expect(prisma.payment.upsert).toHaveBeenCalledWith({
      where: { registrationId: 'reg_1' },
      create: {
        tenantId: 'ten_1',
        registrationId: 'reg_1',
        asaasPaymentId: 'pay_asaas_123',
        amount: 150.00,
        status: 'PENDING',
        method: 'PIX',
        pixQrCode: 'pix-copia-e-cola-code',
        pixExpiration: new Date('2026-06-08T23:59:59.000Z'),
      },
      update: {
        asaasPaymentId: 'pay_asaas_123',
        status: 'PENDING',
        pixQrCode: 'pix-copia-e-cola-code',
        pixExpiration: new Date('2026-06-08T23:59:59.000Z'),
      },
    });

    expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', {
      to: 'customer@test.com',
      subject: 'Inscrição Pendente — Copia e Cola PIX',
      templateId: 'PAYMENT_PENDING_PIX',
      tenantId: 'ten_1',
      variables: {
        userName: 'Astro Customer',
        pixQrCode: 'pix-copia-e-cola-code',
        amount: '150.00',
      },
    });
  });

  // deve processar pagamento via CREDIT_CARD com CPF e expiração PIX ausentes/nulos
  it('should process payment via CREDIT_CARD and handle undefined CPF and null PIX values', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_1',
      tenantId: 'ten_1',
      amount: 250.00,
      method: 'CREDIT_CARD',
      customerEmail: 'customer@test.com',
      customerName: 'Astro Card Holder',
      customerCpf: null, // Testando fallback cpfCnpj || undefined
    });

    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce({
      id: 'ten_1',
      asaasApiKey: 'key_123',
    } as any);

    vi.mocked(asaasService.createCustomer).mockResolvedValueOnce('cus_456');
    vi.mocked(asaasService.createPayment).mockResolvedValueOnce({ id: 'pay_asaas_456' });

    // Act
    await processPayment(job);

    // Assert
    expect(asaasService.createCustomer).toHaveBeenCalledWith({
      name: 'Astro Card Holder',
      email: 'customer@test.com',
      cpfCnpj: '',
    }, 'key_123');

    expect(asaasService.createPayment).toHaveBeenCalledWith({
      customerId: 'cus_456',
      billingType: 'CREDIT_CARD',
      value: 250.00,
      dueDate: expect.any(String),
      externalReference: 'reg_1',
    }, 'key_123');

    expect(prisma.payment.upsert).toHaveBeenCalledWith({
      where: { registrationId: 'reg_1' },
      create: {
        tenantId: 'ten_1',
        registrationId: 'reg_1',
        asaasPaymentId: 'pay_asaas_456',
        amount: 250.00,
        status: 'PENDING',
        method: 'CREDIT_CARD',
      },
      update: {
        asaasPaymentId: 'pay_asaas_456',
        status: 'PENDING',
      },
    });

    // E-mail de PIX não deve ser enviado
    expect(mockEmailQueue.add).not.toHaveBeenCalled();
  });

  // deve processar pagamento via PIX sem expiração definida no Asaas
  it('should handle PIX processing when expirationDate is returned null from Asaas', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_1',
      tenantId: 'ten_1',
      amount: 150.00,
      method: 'PIX',
      customerEmail: 'customer@test.com',
      customerName: 'Astro Customer',
      customerCpf: '12345678900',
    });

    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce({
      id: 'ten_1',
      asaasApiKey: 'key_123',
    } as any);

    vi.mocked(asaasService.createCustomer).mockResolvedValueOnce('cus_123');
    vi.mocked(asaasService.createPayment).mockResolvedValueOnce({ id: 'pay_asaas_123' });
    vi.mocked(asaasService.getPixQrCode).mockResolvedValueOnce({
      payload: 'pix-payload-without-exp',
      expirationDate: null, // Expiracao nula
    });

    // Act
    await processPayment(job);

    // Assert
    expect(prisma.payment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        pixExpiration: null,
      }),
      update: expect.objectContaining({
        pixExpiration: null,
      }),
    }));
  });
});
