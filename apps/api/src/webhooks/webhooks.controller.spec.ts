import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let service: WebhooksService;

  const mockWebhooksService = {
    handleAsaasWebhook: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: WebhooksService, useValue: mockWebhooksService },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
    service = module.get<WebhooksService>(WebhooksService);
  });

  describe('handleAsaas', () => {
    it('should forward request body and asaas-signature header to the service', async () => {
      // Arrange
      const body = { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } };
      const signature = 'sig_header_123';
      const mockResult = { success: true };
      mockWebhooksService.handleAsaasWebhook.mockResolvedValueOnce(mockResult);

      // Act
      const result = await controller.handleAsaas(body, signature);

      // Assert
      expect(service.handleAsaasWebhook).toHaveBeenCalledWith(body, signature);
      expect(result).toEqual(mockResult);
    });
  });
});
