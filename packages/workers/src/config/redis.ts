import { ConnectionOptions } from 'bullmq';

function getRedisConnection(): ConnectionOptions {
  const redisUrl = process.env.UPSTASH_REDIS_URL;

  if (!redisUrl) {
    throw new Error('UPSTASH_REDIS_URL environment variable is required');
  }

  return {
    url: redisUrl,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

export const redisConnection = getRedisConnection();
