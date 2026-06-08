import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRegistrationDto {
  @ApiProperty({ description: 'ID do Evento' })
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @ApiProperty({ description: 'ID da Categoria do Evento' })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiProperty({ description: 'ID do Lote de Inscrição' })
  @IsString()
  @IsNotEmpty()
  batchId: string;

  @ApiPropertyOptional({ description: 'Código do Cupom de Desconto' })
  @IsString()
  @IsOptional()
  couponCode?: string;

  @ApiPropertyOptional({ description: 'Dados complementares do formulário customizado do evento' })
  @IsObject()
  @IsOptional()
  complementaryData?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Método de pagamento selecionado', enum: ['PIX', 'CREDIT_CARD'] })
  @IsString()
  @IsOptional()
  paymentMethod?: 'PIX' | 'CREDIT_CARD';

  @ApiPropertyOptional({ description: 'Dados do cartão de crédito' })
  @IsObject()
  @IsOptional()
  cardDetails?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
    holderCpf?: string;
    holderZipCode?: string;
  };
}
