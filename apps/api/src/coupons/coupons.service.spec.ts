import { Test, TestingModule } from '@nestjs/testing';
import { CouponsService } from './coupons.service';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('CouponsService', () => {
  let service: CouponsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    coupon: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useRealTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CouponsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<CouponsService>(CouponsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('validateCoupon', () => {
    // Normaliza código (trim + maiúsculo) e busca no banco
    it('should normalize coupon code to uppercase and trim spaces', async () => {
      // Arrange
      const now = new Date('2026-06-01T12:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      mockPrismaService.coupon.findUnique.mockResolvedValue({
        id: 'coupon-1',
        eventId: 'event-1',
        code: 'PROMO10',
        discountType: 'PERCENTAGE',
        discountValue: '10.00',
        maxUses: null,
        usedCount: 0,
        validUntil: new Date('2026-12-31T23:59:59Z'),
        active: true,
      });

      // Act
      const result = await service.validateCoupon({
        eventId: 'event-1',
        code: '  promo10  ',
      });

      // Assert
      expect(mockPrismaService.coupon.findUnique).toHaveBeenCalledWith({
        where: {
          eventId_code: {
            eventId: 'event-1',
            code: 'PROMO10',
          },
        },
      });
      expect(result).toEqual({
        valid: true,
        code: 'PROMO10',
        discountType: 'PERCENTAGE',
        discountValue: 10,
      });
    });

    // Cupom inexistente deve retornar 404
    it('should throw NotFoundException when coupon is not found for the event', async () => {
      // Arrange
      mockPrismaService.coupon.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.validateCoupon({
          eventId: 'event-1',
          code: 'NAOEXISTE',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    // Cupom inativo deve retornar BadRequestException
    it('should throw BadRequestException when coupon is inactive', async () => {
      // Arrange
      mockPrismaService.coupon.findUnique.mockResolvedValue({
        id: 'coupon-1',
        eventId: 'event-1',
        code: 'INATIVO',
        discountType: 'PERCENTAGE',
        discountValue: '10.00',
        maxUses: null,
        usedCount: 0,
        validUntil: null,
        active: false,
      });

      // Act & Assert
      await expect(
        service.validateCoupon({
          eventId: 'event-1',
          code: 'INATIVO',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    // Cupom expirado deve retornar BadRequestException
    it('should throw BadRequestException when coupon validUntil is in the past', async () => {
      // Arrange
      const now = new Date('2026-06-15T12:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      mockPrismaService.coupon.findUnique.mockResolvedValue({
        id: 'coupon-1',
        eventId: 'event-1',
        code: 'EXPIRADO',
        discountType: 'FIXED',
        discountValue: '20.00',
        maxUses: null,
        usedCount: 0,
        validUntil: new Date('2026-06-01T00:00:00Z'),
        active: true,
      });

      // Act & Assert
      await expect(
        service.validateCoupon({
          eventId: 'event-1',
          code: 'EXPIRADO',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    // Cupom com limite de uso atingido deve retornar BadRequestException
    it('should throw BadRequestException when coupon usedCount reaches maxUses', async () => {
      // Arrange
      mockPrismaService.coupon.findUnique.mockResolvedValue({
        id: 'coupon-1',
        eventId: 'event-1',
        code: 'ESGOTADO',
        discountType: 'PERCENTAGE',
        discountValue: '15.00',
        maxUses: 10,
        usedCount: 10,
        validUntil: null,
        active: true,
      });

      // Act & Assert
      await expect(
        service.validateCoupon({
          eventId: 'event-1',
          code: 'ESGOTADO',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    // Cupom com maxUses null e sem data de expiração é válido
    it('should validate successfully when maxUses and validUntil are null', async () => {
      // Arrange
      mockPrismaService.coupon.findUnique.mockResolvedValue({
        id: 'coupon-1',
        eventId: 'event-1',
        code: 'ILIMITADO',
        discountType: 'PERCENTAGE',
        discountValue: '25.50',
        maxUses: null,
        usedCount: 150,
        validUntil: null,
        active: true,
      });

      // Act
      const result = await service.validateCoupon({
        eventId: 'event-1',
        code: 'ILIMITADO',
      });

      // Assert
      expect(result).toEqual({
        valid: true,
        code: 'ILIMITADO',
        discountType: 'PERCENTAGE',
        discountValue: 25.5,
      });
    });

    // Cupom do tipo FIXED retorna discountType FIXED e discountValue numérico
    it('should return valid result for FIXED discount type', async () => {
      // Arrange
      mockPrismaService.coupon.findUnique.mockResolvedValue({
        id: 'coupon-1',
        eventId: 'event-1',
        code: 'DESCONTO30',
        discountType: 'FIXED',
        discountValue: '30.00',
        maxUses: 50,
        usedCount: 12,
        validUntil: null,
        active: true,
      });

      // Act
      const result = await service.validateCoupon({
        eventId: 'event-1',
        code: 'DESCONTO30',
      });

      // Assert
      expect(result).toEqual({
        valid: true,
        code: 'DESCONTO30',
        discountType: 'FIXED',
        discountValue: 30,
      });
    });
  });
});
