import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueName, RegistrationJobData } from '@syncflow/shared';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { createClerkClient } from '@clerk/backend';

@Injectable()
export class RegistrationsService {
  private clerkClient = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY || 'mock-secret',
  });

  constructor(
    @InjectQueue(QueueName.REGISTRATION)
    private readonly registrationQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  // Cria a inscrição em estado QUEUED e envia para a fila processar com lock pessimista
  async create(userId: string, dto: CreateRegistrationDto) {
    const { eventId, categoryId, batchId, couponCode, complementaryData } = dto;

    // 1. Garante que o usuário local existe sincronizando preventivamente com o Clerk
    let user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      try {
        const clerkUser = await this.clerkClient.users.getUser(userId);
        const email = clerkUser.emailAddresses[0]?.emailAddress;
        if (!email) {
          throw new Error('User email not found in Clerk');
        }
        const name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || null;

        user = await this.prisma.user.create({
          data: {
            id: userId,
            email,
            name,
            role: 'PARTICIPANT',
          },
        });
      } catch (error) {
        // Fallback em testes locais ou quando o Clerk não estiver disponível
        user = await this.prisma.user.create({
          data: {
            id: userId,
            email: `${userId}@temp-syncflow.com`,
            name: 'Participante Temporário',
            role: 'PARTICIPANT',
          },
        });
      }
    }

    // 2. Busca o evento e valida sua existência
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    // 3. Cria o registro de inscrição prévio como QUEUED (rápido e concorrente)
    const registration = await this.prisma.registration.create({
      data: {
        eventId,
        categoryId,
        batchId,
        userId,
        tenantId: event.tenantId,
        status: 'QUEUED',
        paymentStatus: 'PENDING',
        amountPaid: 0,
        metadata: (complementaryData || {}) as any,
      },
    });

    // 4. Enfileira o job de processamento lógico no BullMQ
    const jobData: RegistrationJobData = {
      registrationId: registration.id,
      userId,
      eventId,
      categoryId,
      batchId,
      tenantId: event.tenantId,
      couponCode,
      complementaryData,
    };

    await this.registrationQueue.add('process-registration', jobData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    return registration;
  }

  // Busca detalhes de uma inscrição e seu pagamento
  async findOne(id: string) {
    const registration = await this.prisma.registration.findUnique({
      where: { id },
      include: {
        payment: true,
        event: {
          select: {
            title: true,
            date: true,
          },
        },
      },
    });

    if (!registration) {
      throw new NotFoundException(`Registration with ID ${id} not found`);
    }

    return registration;
  }
}
