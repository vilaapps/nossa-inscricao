import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { getQueueToken } from '@nestjs/bullmq';
import { QueueName } from '@syncflow/shared';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let mockQueue: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-id' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: getQueueToken(QueueName.WEBHOOK), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  describe('handleAsaasWebhook', () => {
    const body = {
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_asaas_123' },
    };

    // fluxo com assinatura provida
    it('should enqueue webhook job and return success', async () => {
      // Act
      const result = await service.handleAsaasWebhook(body, 'sig_abc_123');

      // Assert
      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-webhook',
        expect.objectContaining({
          provider: 'asaas',
          event: 'PAYMENT_RECEIVED',
          payload: body,
          signature: 'sig_abc_123',
          receivedAt: expect.any(String),
        }),
        expect.any(Object)
      );
      expect(result).toEqual({ success: true });
    });

    // fluxo sem assinatura (cobre o fallback || '')
    it('should enqueue webhook job with empty signature fallback when signature header is missing', async () => {
      // Act
      const result = await service.handleAsaasWebhook(body, null as any);

      // Assert
      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-webhook',
        expect.objectContaining({
          signature: '', // fallback
        }),
        expect.any(Object)
      );
      expect(result).toEqual({ success: true });
    });
  });
});
