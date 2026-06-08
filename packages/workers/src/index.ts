import { Worker } from 'bullmq';
import { QueueName } from '@syncflow/shared';
import { redisConnection } from './config/redis';
import { getQueue } from './config/queues';
import { processRegistration } from './processors/registration.processor';
import { processPayment } from './processors/payment.processor';
import { processWebhook } from './processors/webhook.processor';
import { processEmail } from './processors/email.processor';

const workers: Worker[] = [];

async function bootstrap(): Promise<void> {
  console.log('🚀 SyncFlow Workers starting...');

  // Configura repeatable job para varredura de expiração (rodando a cada 2 minutos)
  const registrationQueue = getQueue(QueueName.REGISTRATION);
  await registrationQueue.add(
    'cleanup-expired-registrations',
    {},
    {
      repeat: {
        pattern: '*/2 * * * *',
      },
    }
  );
  console.log('⏰ Scheduled repeatable job: cleanup-expired-registrations (every 2 minutes)');

  // Instancia cada um dos 4 Workers associados às filas do BullMQ
  const registrationWorker = new Worker(QueueName.REGISTRATION, processRegistration, {
    connection: redisConnection,
    concurrency: 10,
  });

  const paymentWorker = new Worker(QueueName.PAYMENT, processPayment, {
    connection: redisConnection,
    concurrency: 5,
  });

  const webhookWorker = new Worker(QueueName.WEBHOOK, processWebhook, {
    connection: redisConnection,
    concurrency: 5,
  });

  const emailWorker = new Worker(QueueName.EMAIL, processEmail, {
    connection: redisConnection,
    concurrency: 5,
  });

  workers.push(registrationWorker, paymentWorker, webhookWorker, emailWorker);

  // Registra logs de monitoramento unificados para os workers
  workers.forEach((worker) => {
    worker.on('failed', (job, err) => {
      console.error(`❌ Job ${job?.id} in queue ${worker.name} failed:`, err);
    });
    worker.on('completed', (job) => {
      console.log(`✅ Job ${job?.id} in queue ${worker.name} completed`);
    });
  });

  console.log(`📋 Registered queues: ${Object.values(QueueName).join(', ')}`);
  console.log('✅ All workers initialized and listening');
}

async function gracefulShutdown(): Promise<void> {
  console.log('🛑 Graceful shutdown initiated...');

  await Promise.all(workers.map((worker) => worker.close()));

  console.log('👋 All workers closed. Exiting.');
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

bootstrap().catch((error) => {
  console.error('❌ Failed to start workers:', error);
  process.exit(1);
});
