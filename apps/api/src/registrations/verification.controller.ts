import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ReceiptService, PublicReceiptVerification } from './receipt.service';

@ApiTags('Verificação')
@Controller('verificar')
export class VerificationController {
  constructor(private readonly receiptService: ReceiptService) {}

  @Get(':code')
  @ApiOperation({
    summary: 'Consulta pública da autenticidade de um comprovante de inscrição',
  })
  @ApiResponse({
    status: 200,
    description: 'Dados públicos de verificação retornados',
  })
  @ApiResponse({ status: 404, description: 'Comprovante não encontrado' })
  async verify(
    @Param('code') code: string,
  ): Promise<PublicReceiptVerification> {
    return this.receiptService.verifyReceipt(code);
  }
}
