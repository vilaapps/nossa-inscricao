import { Test, TestingModule } from '@nestjs/testing';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';
import { ClerkAuthGuard } from '../infrastructure/auth/clerk-auth.guard';
import { ExecutionContext } from '@nestjs/common';

describe('RegistrationsController', () => {
  let controller: RegistrationsController;
  let service: RegistrationsService;

  const mockRegistrationsService = {
    create: jest.fn(),
    findOne: jest.fn(),
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
      ],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue(mockClerkAuthGuard)
      .compile();

    controller = module.get<RegistrationsController>(RegistrationsController);
    service = module.get<RegistrationsService>(RegistrationsService);
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
      const result = await controller.create(mockReq, dto);

      // Assert
      expect(service.create).toHaveBeenCalledWith('usr_clerk_123', dto);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('findOne', () => {
    it('should invoke service.findOne with id parameter', async () => {
      // Arrange
      const mockResponse = { id: 'reg_1', status: 'CONFIRMED' };
      mockRegistrationsService.findOne.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await controller.findOne('reg_1');

      // Assert
      expect(service.findOne).toHaveBeenCalledWith('reg_1');
      expect(result).toEqual(mockResponse);
    });
  });
});
