import { describe, it, expect } from 'vitest';
import { prisma } from './prisma.service';

describe('PrismaService', () => {
  // deve exportar uma instancia definida do prisma
  it('should export a defined prisma instance', () => {
    // Arrange & Act & Assert
    expect(prisma).toBeDefined();
  });
});
