import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QueueName,
  RegistrationJobData,
  checkCategoryEligibility,
  resolveActiveBatch,
  getCategoryBatchStatus,
} from '@syncflow/shared';
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
    const {
      eventId,
      categoryId,
      couponCode,
      complementaryData,
      athleteBirthDate,
      athleteGender,
      shirtSize,
    } = dto;

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
        const name =
          `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() ||
          null;

        user = await this.prisma.user.create({
          data: {
            id: userId,
            email,
            name,
            role: 'PARTICIPANT',
          },
        });
      } catch {
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

    // 2. Busca o evento e valida status, datas e capacidade contra acessos indevidos
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    if (event.status !== 'PUBLISHED') {
      throw new BadRequestException('Este evento não está aberto para inscrições');
    }

    const now = new Date();

    if (event.registrationOpensAt && now < new Date(event.registrationOpensAt)) {
      throw new BadRequestException(
        'As inscrições para este evento ainda não foram abertas',
      );
    }

    if (now > new Date(event.date)) {
      throw new BadRequestException('Este evento já foi realizado');
    }

    if (event.availableSlots <= 0) {
      throw new BadRequestException('Vagas esgotadas para este evento');
    }

    // 3. Validação do Kit do Evento (Item 1)
    if (!event.hasKit && shirtSize) {
      throw new BadRequestException('Este evento não possui kit ou camiseta');
    }

    if (event.hasKit) {
      if (!shirtSize) {
        throw new BadRequestException(
          'Tamanho de camiseta é obrigatório para este evento',
        );
      }
      const validSizes = event.kitSizes || [];
      if (!validSizes.includes(shirtSize)) {
        throw new BadRequestException(
          `Tamanho de camiseta inválido. Opções disponíveis: ${validSizes.join(', ')}`,
        );
      }
    }

    // 4. Validação da Categoria no Evento
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, eventId },
    });

    if (!category) {
      throw new BadRequestException(
        'Categoria não encontrada para este evento',
      );
    }

    if (category.availableSlots <= 0) {
      throw new BadRequestException('Vagas esgotadas para esta categoria');
    }

    // 5. Validação de Elegibilidade do Atleta (Idade e Gênero)
    const eligibility = checkCategoryEligibility(
      category,
      { birthDate: athleteBirthDate, gender: athleteGender },
      event.date,
    );

    if (!eligibility.eligible) {
      throw new UnprocessableEntityException(
        eligibility.message || 'Atleta não atende aos critérios da categoria',
      );
    }

    // 6. Resolução e Validação do Lote Ativo no Servidor
    let categoryBatches = await this.prisma.batch.findMany({
      where: { categoryId, active: true },
      orderBy: { position: 'asc' },
    });

    // Fallback legado caso os lotes ainda estejam vinculados ao evento
    if (categoryBatches.length === 0) {
      categoryBatches = await this.prisma.batch.findMany({
        where: { eventId, active: true },
        orderBy: { position: 'asc' },
      });
    }

    const batchStatus = getCategoryBatchStatus(
      categoryBatches as any,
      event.registrationOpensAt,
      now,
    );

    if (batchStatus.status === 'NOT_STARTED') {
      throw new BadRequestException(
        'O lote de inscrições para esta categoria ainda não abriu',
      );
    }

    if (batchStatus.status === 'CLOSED' || !batchStatus.activeBatch) {
      throw new BadRequestException(
        'Inscrições encerradas ou nenhum lote aberto para esta categoria',
      );
    }

    const activeBatch = batchStatus.activeBatch;
    const resolvedBatchId = activeBatch.id;

    // 7. Cria o registro de inscrição prévio como QUEUED (rápido e concorrente)
    const registration = await this.prisma.registration.create({
      data: {
        eventId,
        categoryId,
        batchId: resolvedBatchId,
        userId,
        tenantId: event.tenantId,
        status: 'QUEUED',
        paymentStatus: 'PENDING',
        amountPaid: 0,
        athleteBirthDate: new Date(athleteBirthDate),
        athleteGender,
        metadata: {
          ...(complementaryData || {}),
          shirtSize: shirtSize || null,
          paymentMethod: dto.paymentMethod || 'PIX',
          cardDetails: dto.cardDetails || null,
        } as any,
      },
    });

    // 8. Enfileira o job de processamento lógico no BullMQ
    const jobData: RegistrationJobData = {
      registrationId: registration.id,
      userId,
      eventId,
      categoryId,
      batchId: resolvedBatchId,
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

  // Busca detalhes de uma inscrição e seu pagamento com validação de ownership/role
  async findOne(id: string, requester?: { id: string; role?: string }) {
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

    if (requester) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: requester.id },
      });

      const isAdmin = dbUser?.role === 'ADMIN';
      const isOwner = registration.userId === requester.id;

      if (!isAdmin && !isOwner) {
        throw new ForbiddenException('Acesso negado a esta inscrição');
      }
    }

    return registration;
  }
}
