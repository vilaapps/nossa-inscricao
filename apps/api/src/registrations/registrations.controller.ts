import { Controller, Post, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../infrastructure/auth/clerk-auth.guard';
import { RegistrationsService } from './registrations.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';

@ApiTags('Inscrições')
@Controller('registrations')
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Solicita uma nova inscrição de forma assíncrona' })
  @ApiResponse({ status: 201, description: 'Inscrição criada em fila e enviada para processamento' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 404, description: 'Evento não encontrado' })
  async create(@Req() req: any, @Body() dto: CreateRegistrationDto) {
    const userId = req.user.id;
    return this.registrationsService.create(userId, dto);
  }

  @Get(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtém o status de processamento e pagamento da inscrição' })
  @ApiResponse({ status: 200, description: 'Detalhes da inscrição retornados com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 404, description: 'Inscrição não encontrada' })
  async findOne(@Param('id') id: string) {
    return this.registrationsService.findOne(id);
  }
}
