import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('redisConnection Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // deve retornar as opções de conexão corretas quando a URL do Redis estiver configurada
  it('should return connection options when UPSTASH_REDIS_URL is defined', async () => {
    // Arrange
    process.env.UPSTASH_REDIS_URL = 'redis://localhost:6379';

    // Act
    const { redisConnection } = await import('./redis');

    // Assert
    expect(redisConnection).toBeDefined();
    expect(redisConnection.url).toBe('redis://localhost:6379');
    expect(redisConnection.maxRetriesPerRequest).toBeNull();
    expect(redisConnection.enableReadyCheck).toBe(false);
  });

  // deve lançar um erro quando a URL do Redis não estiver configurada
  it('should throw an error when UPSTASH_REDIS_URL is undefined', async () => {
    // Arrange
    delete process.env.UPSTASH_REDIS_URL;

    // Act & Assert
    await expect(import('./redis')).rejects.toThrow(
      'UPSTASH_REDIS_URL environment variable is required'
    );
  });
});
