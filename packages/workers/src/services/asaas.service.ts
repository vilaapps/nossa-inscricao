export interface AsaasCustomerInput {
  name: string;
  cpfCnpj: string;
  email?: string;
}

export interface AsaasPaymentInput {
  customerId: string;
  billingType: 'PIX' | 'CREDIT_CARD';
  value: number;
  dueDate: string;
  externalReference?: string;
  creditCard?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  creditCardHolderInfo?: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    phone: string;
    addressNumber?: string;
  };
}

export class AsaasService {
  private readonly baseUrl: string;
  private readonly globalApiKey: string;

  constructor(apiKey?: string, isProduction: boolean = false) {
    this.baseUrl = isProduction
      ? 'https://api.asaas.com/v3'
      : 'https://api-sandbox.asaas.com/v3';
    
    let key = apiKey ?? process.env.ASAAS_API_KEY ?? '';
    if (key.startsWith('$$')) {
      key = key.slice(1);
    }
    this.globalApiKey = key;
  }

  private getHeaders(customApiKey?: string): Record<string, string> {
    const key = customApiKey || this.globalApiKey;
    if (!key) {
      throw new Error('Asaas API key is missing');
    }
    return {
      'Content-Type': 'application/json',
      'access_token': key,
    };
  }

  // Cria um cliente no gateway do Asaas
  async createCustomer(input: AsaasCustomerInput, customApiKey?: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/customers`, {
      method: 'POST',
      headers: this.getHeaders(customApiKey),
      body: JSON.stringify({
        name: input.name,
        cpfCnpj: input.cpfCnpj,
        email: input.email,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create Asaas customer: ${response.statusText} - ${errorText}`);
    }

    const data: any = await response.json();
    return data.id;
  }

  // Cria uma cobrança (PIX ou Cartão de Crédito)
  async createPayment(input: AsaasPaymentInput, customApiKey?: string): Promise<any> {
    const body: any = {
      customer: input.customerId,
      billingType: input.billingType,
      value: input.value,
      dueDate: input.dueDate,
      externalReference: input.externalReference,
    };

    if (input.billingType === 'CREDIT_CARD') {
      if (!input.creditCard || !input.creditCardHolderInfo) {
        throw new Error('Credit card details are required for CREDIT_CARD billing type');
      }
      body.creditCard = input.creditCard;
      body.creditCardHolderInfo = input.creditCardHolderInfo;
    }

    const response = await fetch(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: this.getHeaders(customApiKey),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create Asaas payment: ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  // Retorna os dados de copia-e-cola e expiração do PIX
  async getPixQrCode(paymentId: string, customApiKey?: string): Promise<{ payload: string; expirationDate: string }> {
    const response = await fetch(`${this.baseUrl}/payments/${paymentId}/pixQrCode`, {
      method: 'GET',
      headers: this.getHeaders(customApiKey),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to retrieve Asaas PIX details: ${response.statusText} - ${errorText}`);
    }

    const data: any = await response.json();
    return {
      payload: data.payload,
      expirationDate: data.expirationDate,
    };
  }

  // Cancela/exclui uma cobrança pendente
  async deletePayment(paymentId: string, customApiKey?: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/payments/${paymentId}`, {
      method: 'DELETE',
      headers: this.getHeaders(customApiKey),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete Asaas payment: ${response.statusText} - ${errorText}`);
    }
  }
}

export const asaasService = new AsaasService();
