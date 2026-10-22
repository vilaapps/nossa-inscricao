import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsISO8601,
  IsIn,
} from 'class-validator';
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

  @ApiPropertyOptional({
    description: 'ID do Lote de Inscrição (opcional, resolvido pelo servidor)',
  })
  @IsString()
  @IsOptional()
  batchId?: string;

  @ApiProperty({
    description: 'Data de nascimento do atleta no formato ISO 8601',
  })
  @IsISO8601()
  @IsNotEmpty()
  athleteBirthDate: string;

  @ApiProperty({
    description: 'Gênero do atleta para conferência de categoria',
    enum: ['MASCULINO', 'FEMININO'],
  })
  @IsIn(['MASCULINO', 'FEMININO'])
  @IsNotEmpty()
  athleteGender: 'MASCULINO' | 'FEMININO';

  @ApiPropertyOptional({
    description:
      'Tamanho da camiseta/kit (obrigatório se o evento possui kit, proibido se não possui)',
  })
  @IsString()
  @IsOptional()
  shirtSize?: string;

  @ApiPropertyOptional({ description: 'Código do Cupom de Desconto' })
  @IsString()
  @IsOptional()
  couponCode?: string;

  @ApiPropertyOptional({
    description: 'Dados complementares do formulário customizado do evento',
  })
  @IsObject()
  @IsOptional()
  complementaryData?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Método de pagamento selecionado',
    enum: ['PIX', 'CREDIT_CARD'],
  })
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
