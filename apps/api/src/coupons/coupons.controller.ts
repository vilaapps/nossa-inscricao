import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CouponsService, ValidatedCouponResult } from './coupons.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@ApiTags('Cupons')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Valida um cupom de desconto para um evento' })
  @ApiResponse({
    status: 200,
    description: 'Cupom válido com dados de desconto',
  })
  @ApiResponse({
    status: 400,
    description: 'Cupom inativo, expirado ou com limite de usos atingido',
  })
  @ApiResponse({ status: 404, description: 'Cupom não encontrado' })
  async validate(
    @Body() dto: ValidateCouponDto,
  ): Promise<ValidatedCouponResult> {
    return this.couponsService.validateCoupon(dto);
  }
}
