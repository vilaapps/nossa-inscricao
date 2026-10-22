import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { ClerkAuthGuard } from '../infrastructure/auth/clerk-auth.guard';
import { RegistrationsService } from './registrations.service';
import { ReceiptService } from './receipt.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';

@ApiTags('Inscrições')
@Controller('registrations')
export class RegistrationsController {
  constructor(
    private readonly registrationsService: RegistrationsService,
    private readonly receiptService: ReceiptService,
  ) {}

  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Solicita uma nova inscrição de forma assíncrona' })
  @ApiResponse({
    status: 201,
    description: 'Inscrição criada em fila e enviada para processamento',
  })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 404, description: 'Evento não encontrado' })
  async create(@Req() req: any, @Body() dto: CreateRegistrationDto) {
    const userId = req.user.id;
    return this.registrationsService.create(userId, dto);
  }

  @Get(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obtém o status de processamento e pagamento da inscrição',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalhes da inscrição retornados com sucesso',
  })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 403, description: 'Acesso negado para outro usuário' })
  @ApiResponse({ status: 404, description: 'Inscrição não encontrada' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    return this.registrationsService.findOne(id, req.user);
  }

  @Get(':id/receipt')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gera e faz download do comprovante oficial de inscrição em PDF',
  })
  @ApiResponse({
    status: 200,
    description: 'Comprovante em formato PDF',
  })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 403, description: 'Acesso negado para outro usuário' })
  @ApiResponse({ status: 404, description: 'Inscrição não encontrada' })
  @ApiResponse({ status: 409, description: 'Inscrição não confirmada' })
  async getReceipt(
    @Req() req: any,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: any,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.receiptService.generateReceipt(
      id,
      req.user,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    return new StreamableFile(buffer);
  }
}
