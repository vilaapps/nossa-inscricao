import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

export interface ValidatedCouponResult {
  valid: boolean;
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async validateCoupon(dto: ValidateCouponDto): Promise<ValidatedCouponResult> {
    const normalizedCode = dto.code.trim().toUpperCase();

    const coupon = await this.prisma.coupon.findUnique({
      where: {
        eventId_code: {
          eventId: dto.eventId,
          code: normalizedCode,
        },
      },
    });

    if (!coupon) {
      throw new NotFoundException('Cupom não encontrado para este evento.');
    }

    if (!coupon.active) {
      throw new BadRequestException('Este cupom está inativo.');
    }

    const now = new Date();
    if (coupon.validUntil && coupon.validUntil < now) {
      throw new BadRequestException('Este cupom está expirado.');
    }

    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException(
        'Este cupom atingiu o limite máximo de utilizações.',
      );
    }

    return {
      valid: true,
      code: coupon.code,
      discountType: coupon.discountType as 'PERCENTAGE' | 'FIXED',
      discountValue: Number(coupon.discountValue),
    };
  }
}
