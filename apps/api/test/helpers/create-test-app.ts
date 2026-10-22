import { Test, TestingModule, TestingModuleBuilder } from '@nestjs/testing';
import { INestApplication, ExecutionContext } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { ClerkAuthGuard } from '../../src/infrastructure/auth/clerk-auth.guard';
import { getQueueToken } from '@nestjs/bullmq';
import { QueueName } from '@syncflow/shared';
import { configureApp } from '../../src/app.config';

jest.mock('bullmq', () => {
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    })),
    Worker: jest.fn(),
    QueueEvents: jest.fn(),
  };
});

export interface TestAppOptions {
  authenticatedUser?: {
    id: string;
    role?: string;
  } | null;
  prismaMock?: Partial<Record<keyof PrismaService, any>>;
  queueMock?: {
    add: jest.Mock;
  };
  customizeModule?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<{
  app: INestApplication;
  module: TestingModule;
  mockPrisma: any;
  mockQueue: any;
}> {
  const mockPrisma = options.prismaMock || {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    event: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    category: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    batch: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    registration: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    coupon: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };

  const mockQueue = options.queueMock || {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  };

  let builder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(mockPrisma)
    .overrideProvider(getQueueToken(QueueName.REGISTRATION))
    .useValue(mockQueue);

  if (options.authenticatedUser !== undefined) {
    const user = options.authenticatedUser;
    builder = builder.overrideGuard(ClerkAuthGuard).useValue({
      canActivate: (context: ExecutionContext) => {
        if (!user) return false;
        const request = context.switchToHttp().getRequest();
        request.user = user;
        return true;
      },
    });
  }

  if (options.customizeModule) {
    builder = options.customizeModule(builder);
  }

  const module = await builder.compile();
  const app = module.createNestApplication();
  configureApp(app);
  await app.init();

  return { app, module, mockPrisma, mockQueue };
}
