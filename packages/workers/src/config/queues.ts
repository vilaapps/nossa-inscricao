import { Queue } from 'bullmq';
import { QueueName } from '@syncflow/shared';
import { redisConnection } from './redis';

const queues: Partial<Record<QueueName, Queue>> = {};

export function getQueue(name: QueueName): Queue {
  if (!queues[name]) {
    queues[name] = new Queue(name, {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    });
  }
  return queues[name]!;
}

export async function closeAllQueues(): Promise<void> {
  const activeQueues = Object.values(queues);
  await Promise.all(activeQueues.map((queue) => queue.close()));
  
  // Limpa o cache após fechar
  for (const key of Object.keys(queues)) {
    delete queues[key as QueueName];
  }
}
