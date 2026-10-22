import { Test, TestingModule } from '@nestjs/testing';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';
import { ReceiptService } from './receipt.service';
import { ClerkAuthGuard } from '../infrastructure/auth/clerk-auth.guard';
import { ExecutionContext, StreamableFile } from '@nestjs/common';

describe('RegistrationsController', () => {
  let controller: RegistrationsController;
  let registrationsService: RegistrationsService;
  let receiptService: ReceiptService;

  const mockRegistrationsService = {
    create: jest.fn(),
    findOne: jest.fn(),
  };

  const mockReceiptService = {
    generateReceipt: jest.fn(),
  };

  const mockClerkAuthGuard = {
    canActivate: jest.fn().mockImplementation((context: ExecutionContext) => {
      const request = context.switchToHttp().getRequest();
      request.user = { id: 'usr_clerk_123' };
      return true;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RegistrationsController],
      providers: [
        { provide: RegistrationsService, useValue: mockRegistrationsService },
        { provide: ReceiptService, useValue: mockReceiptService },
      ],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue(mockClerkAuthGuard)
      .compile();

    controller = module.get<RegistrationsController>(RegistrationsController);
    registrationsService =
      module.get<RegistrationsService>(RegistrationsService);
    receiptService = module.get<ReceiptService>(ReceiptService);
  });

  describe('create', () => {
    it('should invoke service.create with authenticated user id and dto', async () => {
      // Arrange
      const mockReq = { user: { id: 'usr_clerk_123' } };
      const dto = {
        eventId: 'evt_1',
        categoryId: 'cat_1',
        batchId: 'bat_1',
        couponCode: 'CUPOM50',
        complementaryData: { age: 30 },
      };
      const mockResponse = { id: 'reg_1', status: 'QUEUED' };
      mockRegistrationsService.create.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await controller.create(mockReq, dto as any);

      // Assert
      expect(registrationsService.create).toHaveBeenCalledWith(
        'usr_clerk_123',
        dto,
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('findOne', () => {
    it('should invoke service.findOne with id and authenticated user', async () => {
      // Arrange
      const mockReq = { user: { id: 'usr_clerk_123' } };
      const mockResponse = { id: 'reg_1', status: 'CONFIRMED' };
      mockRegistrationsService.findOne.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await controller.findOne(mockReq, 'reg_1');

      // Assert
      expect(registrationsService.findOne).toHaveBeenCalledWith(
        'reg_1',
        mockReq.user,
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getReceipt', () => {
    it('should generate receipt and return a StreamableFile with PDF headers', async () => {
      // Arrange
      const mockReq = { user: { id: 'usr_clerk_123' } };
      const mockRes = { set: jest.fn() };
      const pdfBuffer = Buffer.from('%PDF-dummy-content');
      mockReceiptService.generateReceipt.mockResolvedValueOnce({
        buffer: pdfBuffer,
        filename: 'comprovante-REC-1234.pdf',
      });

      // Act
      const result = await controller.getReceipt(mockReq, 'reg_1', mockRes);

      // Assert
      expect(receiptService.generateReceipt).toHaveBeenCalledWith(
        'reg_1',
        mockReq.user,
      );
      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          'attachment; filename="comprovante-REC-1234.pdf"',
        'Content-Length': pdfBuffer.length,
      });
      expect(result).toBeInstanceOf(StreamableFile);
    });
  });
});
