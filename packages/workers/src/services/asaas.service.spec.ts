import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AsaasService } from './asaas.service';

describe('AsaasService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv('ASAAS_API_KEY', 'test-global-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // deve instanciar com URL de producao se isProduction for verdadeiro
  it('should instantiate with production URL when isProduction is true', () => {
    // Arrange & Act
    const service = new AsaasService('prod-key', true);

    // Assert
    expect((service as any).baseUrl).toBe('https://api.asaas.com/v3');
    expect((service as any).globalApiKey).toBe('prod-key');
  });

  // deve usar string vazia como chave global se nada for fornecido e env estiver vazia
  it('should fallback to empty string key if no param and no env are defined', () => {
    // Arrange
    vi.stubEnv('ASAAS_API_KEY', undefined as any);

    // Act
    const service = new AsaasService(undefined, false);

    // Assert
    expect((service as any).globalApiKey).toBe('');
  });

  // deve limpar cifrão extra se chave iniciar com cifrão duplo ($$)
  it('should clean duplicate dollar signs if API key starts with $$', () => {
    // Arrange
    const service = new AsaasService('$$aact_test_key', false);

    // Act & Assert
    expect((service as any).globalApiKey).toBe('$aact_test_key');
  });

  // deve lancar erro se nenhuma chave de API for fornecida
  it('should throw an error if no API key is defined anywhere', async () => {
    // Arrange
    vi.stubEnv('ASAAS_API_KEY', undefined as any);
    const service = new AsaasService(undefined, false);

    // Act & Assert
    await expect(
      service.createCustomer({ name: 'Test', cpfCnpj: '123' })
    ).rejects.toThrow('Asaas API key is missing');
  });

  // deve criar um customer com sucesso usando a chave global
  it('should create a customer successfully using the global API key', async () => {
    // Arrange
    const service = new AsaasService();
    const mockResponse = { id: 'cus_12345' };
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const input = {
      name: 'John Doe',
      cpfCnpj: '12345678900',
      email: 'john@example.com',
    };

    // Act
    const customerId = await service.createCustomer(input);

    // Assert
    expect(customerId).toBe('cus_12345');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api-sandbox.asaas.com/v3/customers',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': 'test-global-key',
        },
        body: JSON.stringify(input),
      })
    );
  });

  // deve usar a chave customizada/tenant se for provida
  it('should use custom tenant API key when provided', async () => {
    // Arrange
    const service = new AsaasService();
    const mockResponse = { id: 'cus_12345' };
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const input = { name: 'John Doe', cpfCnpj: '12345678900' };
    const customKey = 'tenant-custom-key';

    // Act
    await service.createCustomer(input, customKey);

    // Assert
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'access_token': customKey,
        },
      })
    );
  });

  // deve lancar erro caso a criacao do customer falhe na API do Asaas
  it('should throw an error if customer creation fails on gateway', async () => {
    // Arrange
    const service = new AsaasService();
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Bad Request',
      text: async () => 'Invalid CPF',
    } as Response);

    // Act & Assert
    await expect(
      service.createCustomer({ name: 'John Doe', cpfCnpj: '123' })
    ).rejects.toThrow('Failed to create Asaas customer: Bad Request - Invalid CPF');
  });

  // deve criar cobranca PIX com sucesso
  it('should create a PIX payment successfully', async () => {
    // Arrange
    const service = new AsaasService();
    const mockPaymentResponse = { id: 'pay_123', status: 'PENDING' };
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPaymentResponse,
    } as Response);

    const input = {
      customerId: 'cus_123',
      billingType: 'PIX' as const,
      value: 150.00,
      dueDate: '2026-12-31',
      externalReference: 'reg_123',
    };

    // Act
    const response = await service.createPayment(input);

    // Assert
    expect(response).toEqual(mockPaymentResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api-sandbox.asaas.com/v3/payments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          customer: 'cus_123',
          billingType: 'PIX',
          value: 150.00,
          dueDate: '2026-12-31',
          externalReference: 'reg_123',
        }),
      })
    );
  });

  // deve lancar erro ao tentar criar cobranca de cartao sem dados do cartao ou titular
  it('should throw an error when creating credit card payment without card details', async () => {
    // Arrange
    const service = new AsaasService();
    const input = {
      customerId: 'cus_123',
      billingType: 'CREDIT_CARD' as const,
      value: 150.00,
      dueDate: '2026-12-31',
    };

    // Act & Assert
    await expect(
      service.createPayment(input)
    ).rejects.toThrow('Credit card details are required for CREDIT_CARD billing type');
  });

  // deve criar cobranca de Cartao de Credito com sucesso se todos dados forem providos
  it('should create a credit card payment successfully when details are provided', async () => {
    // Arrange
    const service = new AsaasService();
    const mockPaymentResponse = { id: 'pay_cc_123', status: 'CONFIRMED' };
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPaymentResponse,
    } as Response);

    const input = {
      customerId: 'cus_123',
      billingType: 'CREDIT_CARD' as const,
      value: 200.00,
      dueDate: '2026-12-31',
      creditCard: {
        holderName: 'John Doe',
        number: '1234567812345678',
        expiryMonth: '12',
        expiryYear: '2029',
        ccv: '123',
      },
      creditCardHolderInfo: {
        name: 'John Doe',
        email: 'john@example.com',
        cpfCnpj: '12345678900',
        postalCode: '01001000',
        phone: '11999999999',
      },
    };

    // Act
    const response = await service.createPayment(input);

    // Assert
    expect(response).toEqual(mockPaymentResponse);
  });

  // deve lancar erro caso a criacao do pagamento falhe no gateway
  it('should throw an error if payment creation fails on gateway', async () => {
    // Arrange
    const service = new AsaasService();
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Unauthorized',
      text: async () => 'Refused',
    } as Response);

    const input = {
      customerId: 'cus_123',
      billingType: 'PIX' as const,
      value: 50.00,
      dueDate: '2026-12-31',
    };

    // Act & Assert
    await expect(
      service.createPayment(input)
    ).rejects.toThrow('Failed to create Asaas payment: Unauthorized - Refused');
  });

  // deve buscar detalhes do QR Code PIX com sucesso
  it('should retrieve PIX QR code details successfully', async () => {
    // Arrange
    const service = new AsaasService();
    const mockPixDetails = {
      payload: 'pix-payload-copia-e-cola',
      expirationDate: '2026-12-31T23:59:59Z',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPixDetails,
    } as Response);

    // Act
    const response = await service.getPixQrCode('pay_123');

    // Assert
    expect(response).toEqual(mockPixDetails);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api-sandbox.asaas.com/v3/payments/pay_123/pixQrCode',
      expect.any(Object)
    );
  });

  // deve lancar erro ao falhar na recuperacao do QR Code PIX
  it('should throw an error when PIX QR Code retrieval fails', async () => {
    // Arrange
    const service = new AsaasService();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Not Found',
      text: async () => 'Payment not found',
    } as Response);

    // Act & Assert
    await expect(
      service.getPixQrCode('pay_invalid')
    ).rejects.toThrow('Failed to retrieve Asaas PIX details: Not Found - Payment not found');
  });

  // deve excluir um pagamento com sucesso
  it('should delete a payment successfully', async () => {
    // Arrange
    const service = new AsaasService();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
    } as Response);

    // Act
    await service.deletePayment('pay_123');

    // Assert
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api-sandbox.asaas.com/v3/payments/pay_123',
      expect.objectContaining({
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'access_token': 'test-global-key',
        },
      })
    );
  });

  // deve lancar erro ao falhar na exclusao do pagamento
  it('should throw an error when payment deletion fails', async () => {
    // Arrange
    const service = new AsaasService();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Bad Request',
      text: async () => 'Payment cannot be deleted',
    } as Response);

    // Act & Assert
    await expect(
      service.deletePayment('pay_123')
    ).rejects.toThrow('Failed to delete Asaas payment: Bad Request - Payment cannot be deleted');
  });
});
