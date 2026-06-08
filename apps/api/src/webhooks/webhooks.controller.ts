import { Controller, Post, Body, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('asaas')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recebe notificações de eventos de cobrança do Asaas' })
  @ApiResponse({ status: 200, description: 'Notificação recebida e enfileirada com sucesso' })
  async handleAsaas(
    @Body() body: any,
    @Headers('asaas-signature') signature: string,
  ) {
    return this.webhooksService.handleAsaasWebhook(body, signature);
  }
}
