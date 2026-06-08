export interface RegistrationJobData {
  registrationId: string;
  userId: string;
  eventId: string;
  categoryId: string;
  batchId: string;
  tenantId: string;
  couponCode?: string;
  complementaryData?: Record<string, unknown>;
}

export interface PaymentJobData {
  registrationId: string;
  orderId: string;
  userId: string;
  tenantId: string;
  amount: number;
  method: 'PIX' | 'CREDIT_CARD';
  customerEmail: string;
  customerName: string;
  customerCpf: string;
}

export interface WebhookJobData {
  provider: 'asaas';
  event: string;
  payload: Record<string, unknown>;
  signature: string;
  receivedAt: string;
}

export interface EmailJobData {
  to: string;
  subject: string;
  templateId: string;
  tenantId: string;
  variables: Record<string, string>;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: 'ADMIN' | 'ORGANIZER' | 'PARTICIPANT';
}
