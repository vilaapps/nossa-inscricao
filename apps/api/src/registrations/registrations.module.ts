import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueName } from '@syncflow/shared';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';
import { ReceiptService } from './receipt.service';
import { VerificationController } from './verification.controller';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QueueName.REGISTRATION,
    }),
  ],
  controllers: [RegistrationsController, VerificationController],
  providers: [RegistrationsService, ReceiptService],
  exports: [RegistrationsService, ReceiptService],
})
export class RegistrationsModule {}
