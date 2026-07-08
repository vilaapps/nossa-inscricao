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
      registration: {
        update: vi.fn(),
      },
    },
  };
});

// Mock do Asaas Service
vi.mock('../services/asaas.service', () => {
  return {
    asaasService: {
      findCustomer: vi.fn().mockResolvedValue(null),
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
    await expect(processPayment(job)).rejects.toThrow('Tenant ten_none not found');
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
    });

    expect(asaasService.createPayment).toHaveBeenCalledWith({
      customerId: 'cus_123',
      billingType: 'PIX',
      value: 150.00,
      dueDate: expect.any(String),
      externalReference: 'reg_1',
    });

    expect(prisma.payment.upsert).toHaveBeenCalledWith({
      where: { registrationId: 'reg_1' },
      create: {
        tenantId: 'ten_1',
        registrationId: 'reg_1',
        gatewayPaymentId: 'pay_asaas_123',
        amount: 150.00,
        status: 'PENDING',
        method: 'PIX',
        pixQrCode: 'pix-copia-e-cola-code',
        pixExpiration: new Date('2026-06-08T23:59:59.000Z'),
      },
      update: {
        gatewayPaymentId: 'pay_asaas_123',
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
      customerCpf: null,
      creditCard: {
        holderName: 'Astro Card Holder',
        number: '1234123412341234',
        expiryMonth: '12',
        expiryYear: '2030',
        ccv: '123',
      },
      creditCardHolderInfo: {
        name: 'Astro Card Holder',
        email: 'customer@test.com',
        cpfCnpj: '123.456.789-00',
        postalCode: '12345-678',
        phone: '21999999999',
      },
    });

    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce({
      id: 'ten_1',
    } as any);

    vi.mocked(asaasService.createCustomer).mockResolvedValueOnce('cus_456');
    vi.mocked(asaasService.createPayment).mockResolvedValueOnce({
      id: 'pay_asaas_456',
      status: 'CONFIRMED',
    });

    // Act
    await processPayment(job);

    // Assert
    expect(asaasService.createCustomer).toHaveBeenCalledWith({
      name: 'Astro Card Holder',
      email: 'customer@test.com',
      cpfCnpj: '',
    });

    expect(asaasService.createPayment).toHaveBeenCalledWith({
      customerId: 'cus_456',
      billingType: 'CREDIT_CARD',
      value: 250.00,
      dueDate: expect.any(String),
      externalReference: 'reg_1',
      creditCard: {
        holderName: 'Astro Card Holder',
        number: '1234123412341234',
        expiryMonth: '12',
        expiryYear: '2030',
        ccv: '123',
      },
      creditCardHolderInfo: {
        name: 'Astro Card Holder',
        email: 'customer@test.com',
        cpfCnpj: '123.456.789-00',
        postalCode: '12345-678',
        phone: '21999999999',
      },
    });

    expect(prisma.payment.upsert).toHaveBeenCalledWith({
      where: { registrationId: 'reg_1' },
      create: {
        tenantId: 'ten_1',
        registrationId: 'reg_1',
        gatewayPaymentId: 'pay_asaas_456',
        amount: 250.00,
        status: 'PAID',
        method: 'CREDIT_CARD',
      },
      update: {
        gatewayPaymentId: 'pay_asaas_456',
        status: 'PAID',
      },
    });

    expect(prisma.registration.update).toHaveBeenCalledWith({
      where: { id: 'reg_1' },
      data: {
        paymentStatus: 'PAID',
        amountPaid: 250.00,
        status: 'CONFIRMED',
      },
    });
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
    } as any);

    vi.mocked(asaasService.createCustomer).mockResolvedValueOnce('cus_123');
    vi.mocked(asaasService.createPayment).mockResolvedValueOnce({ id: 'pay_asaas_123' });
    vi.mocked(asaasService.getPixQrCode).mockResolvedValueOnce({
      payload: 'pix-payload-without-exp',
      expirationDate: null,
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

  // deve processar pagamento via CREDIT_CARD com status RECEIVED
  it('should process payment via CREDIT_CARD and set status to PAID when asaas status is RECEIVED', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_1',
      tenantId: 'ten_1',
      amount: 250.00,
      method: 'CREDIT_CARD',
      customerEmail: 'customer@test.com',
      customerName: 'Astro Card Holder',
      customerCpf: null,
      creditCard: {
        holderName: 'Astro Card Holder',
        number: '1234123412341234',
        expiryMonth: '12',
        expiryYear: '2030',
        ccv: '123',
      },
      creditCardHolderInfo: {
        name: 'Astro Card Holder',
        email: 'customer@test.com',
        cpfCnpj: '123.456.789-00',
        postalCode: '12345-678',
        phone: '21999999999',
      },
    });

    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce({
      id: 'ten_1',
    } as any);

    vi.mocked(asaasService.createCustomer).mockResolvedValueOnce('cus_456');
    vi.mocked(asaasService.createPayment).mockResolvedValueOnce({
      id: 'pay_asaas_456',
      status: 'RECEIVED',
    });

    // Act
    await processPayment(job);

    // Assert
    expect(prisma.payment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        status: 'PAID',
      }),
    }));
  });

  it('should reuse an existing customer if findCustomer returns a customer ID', async () => {
    // Arrange
    const job = createMockJob({
      registrationId: 'reg_123',
      tenantId: 'ten_1',
      amount: 150.00,
      method: 'PIX',
      customerEmail: 'customer@test.com',
      customerName: 'Astro Customer',
      customerCpf: '12345678900',
    });

    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce({
      id: 'ten_1',
    } as any);

    // Mock findCustomer to return an existing customer ID
    vi.mocked(asaasService.findCustomer).mockResolvedValueOnce('cus_existing_123');
    
    vi.mocked(asaasService.createPayment).mockResolvedValueOnce({
      id: 'pay_asaas_123',
      status: 'PENDING',
    });

    vi.mocked(asaasService.getPixQrCode).mockResolvedValueOnce({
      payload: 'pix-payload',
      expirationDate: '2026-06-09T00:00:00.000Z',
    });

    // Act
    await processPayment(job);

    // Assert
    expect(asaasService.findCustomer).toHaveBeenCalledWith('12345678900', 'customer@test.com');
    expect(asaasService.createCustomer).not.toHaveBeenCalled();
    expect(asaasService.createPayment).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'cus_existing_123',
    }));
  });
});
