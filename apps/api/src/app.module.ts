import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get<string>('UPSTASH_REDIS_URL');
        return {
          connection: redisUrl
            ? {
                url: redisUrl,
                maxRetriesPerRequest: null,
                enableReadyCheck: false,
              }
            : {
                host: configService.get<string>('REDIS_HOST') || '127.0.0.1',
                port: parseInt(configService.get<string>('REDIS_PORT') || '6379', 10),
                maxRetriesPerRequest: null,
                enableReadyCheck: false,
              },
        };
      },
      inject: [ConfigService],
    }),
    PrismaModule,
    RegistrationsModule,
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

