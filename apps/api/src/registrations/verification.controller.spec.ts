import { Test, TestingModule } from '@nestjs/testing';
import { VerificationController } from './verification.controller';
import { ReceiptService } from './receipt.service';

describe('VerificationController', () => {
  let controller: VerificationController;
  let receiptService: ReceiptService;

  const mockReceiptService = {
    verifyReceipt: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VerificationController],
      providers: [
        {
          provide: ReceiptService,
          useValue: mockReceiptService,
        },
      ],
    }).compile();

    controller = module.get<VerificationController>(VerificationController);
    receiptService = module.get<ReceiptService>(ReceiptService);
  });

  describe('verify', () => {
    // Delega verificação pública ao ReceiptService
    it('should delegate verification to receiptService.verifyReceipt', async () => {
      // Arrange
      const mockResult = {
        valid: true,
        receiptCode: 'REC-ABCD-1234',
        status: 'CONFIRMED',
        athleteName: 'Carlos S. M.',
        eventName: 'Meia Maratona 21K',
        eventDate: new Date('2026-11-20T08:00:00Z'),
        categoryName: 'Geral 21K',
      };
      mockReceiptService.verifyReceipt.mockResolvedValueOnce(mockResult);

      // Act
      const result = await controller.verify('REC-ABCD-1234');

      // Assert
      expect(receiptService.verifyReceipt).toHaveBeenCalledWith(
        'REC-ABCD-1234',
      );
      expect(result).toEqual(mockResult);
    });
  });
});
