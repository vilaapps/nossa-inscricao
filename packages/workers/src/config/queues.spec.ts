import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Queue } from 'bullmq';
import { QueueName } from '@syncflow/shared';

// Mock do Redis Connection para evitar que a validação de UPSTASH_REDIS_URL lance exceção
vi.mock('./redis', () => {
  return {
    redisConnection: {
      on: vi.fn(),
      quit: vi.fn(),
    },
  };
});

// Mock do BullMQ Queue com instâncias isoladas de close()
vi.mock('bullmq', () => {
  return {
    Queue: vi.fn().mockImplementation(() => {
      return {
        close: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

import { getQueue, closeAllQueues } from './queues';

describe('Queues Config Manager', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await closeAllQueues();
  });

  // deve retornar uma instancia da Queue correspondente e cachear
  it('should return a singleton Queue instance and cache it', () => {
    // Arrange
    const mockQueueClass = vi.mocked(Queue);

    // Act
    const q1 = getQueue(QueueName.REGISTRATION);
    const q2 = getQueue(QueueName.REGISTRATION);

    // Assert
    expect(q1).toBe(q2);
    expect(mockQueueClass).toHaveBeenCalledTimes(1);
    expect(mockQueueClass).toHaveBeenCalledWith(
      QueueName.REGISTRATION,
      expect.objectContaining({
        connection: expect.any(Object),
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false,
        },
      })
    );
  });

  // deve fechar todas as filas e limpar cache no closeAllQueues
  it('should close all instantiated queues and purge cache', async () => {
    // Arrange
    const q1 = getQueue(QueueName.REGISTRATION);
    const q2 = getQueue(QueueName.PAYMENT);
    
    // Act
    await closeAllQueues();

    // Assert
    expect(q1.close).toHaveBeenCalledTimes(1);
    expect(q2.close).toHaveBeenCalledTimes(1);

    // Act 2: Se chamar novamente getQueue, deve criar novas instâncias (pois o cache foi limpo)
    const mockQueueClass = vi.mocked(Queue);
    mockQueueClass.mockClear();
    
    getQueue(QueueName.REGISTRATION);

    // Assert 2
    expect(mockQueueClass).toHaveBeenCalledTimes(1);
  });
});
