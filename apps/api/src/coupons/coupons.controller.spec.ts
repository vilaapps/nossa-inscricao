import { Test, TestingModule } from '@nestjs/testing';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

describe('CouponsController', () => {
  let controller: CouponsController;
  let service: CouponsService;

  const mockCouponsService = {
    validateCoupon: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CouponsController],
      providers: [
        {
          provide: CouponsService,
          useValue: mockCouponsService,
        },
      ],
    }).compile();

    controller = module.get<CouponsController>(CouponsController);
    service = module.get<CouponsService>(CouponsService);
  });

  describe('validate', () => {
    // Delega validação ao CouponsService
    it('should delegate coupon validation to couponsService', async () => {
      // Arrange
      const dto: ValidateCouponDto = {
        eventId: 'event-1',
        code: 'PROMO10',
      };
      const expectedResult = {
        valid: true,
        code: 'PROMO10',
        discountType: 'PERCENTAGE' as const,
        discountValue: 10,
      };
      mockCouponsService.validateCoupon.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.validate(dto);

      // Assert
      expect(mockCouponsService.validateCoupon).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResult);
    });
  });
});
