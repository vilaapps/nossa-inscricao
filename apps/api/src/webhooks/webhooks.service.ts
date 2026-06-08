import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueName, WebhookJobData } from '@syncflow/shared';

@Injectable()
export class WebhooksService {
  constructor(
    @InjectQueue(QueueName.WEBHOOK)
    private readonly webhookQueue: Queue,
  ) {}

  // Recebe e enfileira o webhook bruto para processamento assíncrono e resiliente
  async handleAsaasWebhook(body: any, signature: string): Promise<{ success: boolean }> {
    const jobData: WebhookJobData = {
      provider: 'asaas',
      event: body.event,
      payload: body,
      signature: signature || '',
      receivedAt: new Date().toISOString(),
    };

    // Enfileira com política de retentativa exponencial de 5s e máx 3 tentativas
    await this.webhookQueue.add('process-webhook', jobData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    return { success: true };
  }
}
