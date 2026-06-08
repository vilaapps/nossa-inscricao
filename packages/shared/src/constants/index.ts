export enum QueueName {
  REGISTRATION = 'registration-queue',
  PAYMENT = 'payment-queue',
  WEBHOOK = 'webhook-queue',
  EMAIL = 'email-queue',
}

export enum QueuePriority {
  CRITICAL = 1,
  HIGH = 2,
  NORMAL = 3,
  LOW = 4,
}

export const QUEUE_CONFIG = {
  [QueueName.WEBHOOK]: {
    priority: QueuePriority.CRITICAL,
    maxRetries: 5,
    backoffType: 'exponential' as const,
    backoffDelay: 1000,
  },
  [QueueName.REGISTRATION]: {
    priority: QueuePriority.HIGH,
    maxRetries: 3,
    backoffType: 'exponential' as const,
    backoffDelay: 2000,
  },
  [QueueName.PAYMENT]: {
    priority: QueuePriority.HIGH,
    maxRetries: 3,
    backoffType: 'exponential' as const,
    backoffDelay: 2000,
  },
  [QueueName.EMAIL]: {
    priority: QueuePriority.NORMAL,
    maxRetries: 5,
    backoffType: 'exponential' as const,
    backoffDelay: 3000,
  },
} as const;

export enum RegistrationStatus {
  QUEUED = 'QUEUED',
  PENDING = 'PENDING',
  AWAITING_PAYMENT = 'AWAITING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  EXPIRED = 'EXPIRED',
}

export enum PaymentMethod {
  PIX = 'PIX',
  CREDIT_CARD = 'CREDIT_CARD',
}

export enum EventStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  ORGANIZER = 'ORGANIZER',
  PARTICIPANT = 'PARTICIPANT',
}

export enum BatchType {
  BY_PERIOD = 'BY_PERIOD',
  BY_QUANTITY = 'BY_QUANTITY',
}
