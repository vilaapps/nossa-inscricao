import { Test, TestingModule } from '@nestjs/testing';
import { RegistrationsService } from './registrations.service';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';
import { QueueName } from '@syncflow/shared';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createClerkClient } from '@clerk/backend';

// Mock do Clerk Backend
jest.mock('@clerk/backend', () => {
  const mockGetUser = jest.fn();
  return {
    createClerkClient: jest.fn().mockImplementation(() => {
      return {
        users: {
          getUser: mockGetUser,
        },
      };
    }),
  };
});

describe('RegistrationsService', () => {
  let service: RegistrationsService;
  let prisma: PrismaService;
  let mockQueue: any;
  let mockClerkClientInstance: any;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    event: {
      findUnique: jest.fn(),
    },
    category: {
      findFirst: jest.fn(),
    },
    batch: {
      findMany: jest.fn(),
    },
    registration: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-id' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: getQueueToken(QueueName.REGISTRATION), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<RegistrationsService>(RegistrationsService);
    prisma = module.get<PrismaService>(PrismaService);
    mockClerkClientInstance = (createClerkClient as jest.Mock).mock.results[0]
      .value;
  });

  describe('create', () => {
    const defaultEvent = {
      id: 'evt_1',
      tenantId: 'ten_1',
      status: 'PUBLISHED',
      date: new Date(Date.now() + 86400000 * 30),
      registrationOpensAt: new Date(Date.now() - 86400000 * 2),
      availableSlots: 100,
      hasKit: true,
      kitSizes: ['P', 'M', 'G', 'GG'],
    };

    const defaultCategory = {
      id: 'cat_1',
      eventId: 'evt_1',
      name: '10KM Geral',
      minAge: 18,
      maxAge: 65,
      gender: 'MISTO',
      availableSlots: 50,
    };

    const defaultBatch = {
      id: 'bat_resolved_1',
      categoryId: 'cat_1',
      name: '1º Lote',
      type: 'QUANTITY',
      position: 1,
      price: 90,
      maxQuantity: 100,
      soldQuantity: 10,
      active: true,
    };

    const validDto = {
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_client_ignored',
      athleteBirthDate: '1995-05-20T00:00:00.000Z',
      athleteGender: 'MASCULINO' as const,
      shirtSize: 'M',
      couponCode: 'SALE10',
      complementaryData: { team: 'Runners' },
    };

    // fluxo de sucesso com usuario existente e resolução do lote no servidor
    it('should create registration resolving batch server-side and enqueue job', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce({ id: 'usr_1' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce(defaultEvent);
      prisma.category.findFirst = jest
        .fn()
        .mockResolvedValueOnce(defaultCategory);
      prisma.batch.findMany = jest.fn().mockResolvedValueOnce([defaultBatch]);
      prisma.registration.create = jest
        .fn()
        .mockResolvedValueOnce({ id: 'reg_1' });

      // Act
      const result = await service.create('usr_1', validDto);

      // Assert
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'usr_1' },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.event.findUnique).toHaveBeenCalledWith({
        where: { id: 'evt_1' },
      });
      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: { id: 'cat_1', eventId: 'evt_1' },
      });
      expect(prisma.batch.findMany).toHaveBeenCalledWith({
        where: { categoryId: 'cat_1', active: true },
        orderBy: { position: 'asc' },
      });
      expect(prisma.registration.create).toHaveBeenCalledWith({
        data: {
          eventId: 'evt_1',
          categoryId: 'cat_1',
          batchId: 'bat_resolved_1', // lote resolvido no servidor
          userId: 'usr_1',
          tenantId: 'ten_1',
          status: 'QUEUED',
          paymentStatus: 'PENDING',
          amountPaid: 0,
          athleteBirthDate: new Date('1995-05-20T00:00:00.000Z'),
          athleteGender: 'MASCULINO',
          metadata: {
            team: 'Runners',
            shirtSize: 'M',
            paymentMethod: 'PIX',
            cardDetails: null,
          },
        },
      });
      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-registration',
        expect.objectContaining({
          registrationId: 'reg_1',
          batchId: 'bat_resolved_1',
          couponCode: 'SALE10',
        }),
        expect.any(Object),
      );
      expect(result).toEqual({ id: 'reg_1' });
    });

    // fluxo de sucesso buscando usuario no Clerk
    it('should fetch user from Clerk and save local record if user is missing', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce(null);
      mockClerkClientInstance.users.getUser.mockResolvedValueOnce({
        firstName: 'John',
        lastName: 'Doe',
        emailAddresses: [{ emailAddress: 'john.doe@test.com' }],
      });
      prisma.user.create = jest.fn().mockResolvedValueOnce({ id: 'usr_2' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce(defaultEvent);
      prisma.category.findFirst = jest
        .fn()
        .mockResolvedValueOnce(defaultCategory);
      prisma.batch.findMany = jest.fn().mockResolvedValueOnce([defaultBatch]);
      prisma.registration.create = jest
        .fn()
        .mockResolvedValueOnce({ id: 'reg_2' });

      // Act
      await service.create('usr_2', validDto);

      // Assert
      expect(mockClerkClientInstance.users.getUser).toHaveBeenCalledWith(
        'usr_2',
      );
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          id: 'usr_2',
          email: 'john.doe@test.com',
          name: 'John Doe',
          role: 'PARTICIPANT',
        },
      });
    });

    // fluxo com falha ao obter no Clerk (cria com fallback)
    it('should create user with fallback if Clerk API fails', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce(null);
      mockClerkClientInstance.users.getUser.mockRejectedValueOnce(
        new Error('Clerk offline'),
      );
      prisma.user.create = jest.fn().mockResolvedValueOnce({ id: 'usr_3' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce(defaultEvent);
      prisma.category.findFirst = jest
        .fn()
        .mockResolvedValueOnce(defaultCategory);
      prisma.batch.findMany = jest.fn().mockResolvedValueOnce([defaultBatch]);
      prisma.registration.create = jest
        .fn()
        .mockResolvedValueOnce({ id: 'reg_3' });

      // Act
      await service.create('usr_3', validDto);

      // Assert
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          id: 'usr_3',
          email: 'usr_3@temp-syncflow.com',
          name: 'Participante Temporário',
          role: 'PARTICIPANT',
        },
      });
    });

    // fluxo com erro por falta de email do usuario no Clerk
    it('should create user with fallback even if email addresses list is empty in Clerk', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce(null);
      mockClerkClientInstance.users.getUser.mockResolvedValueOnce({
        firstName: 'NoEmail',
        lastName: 'User',
        emailAddresses: [],
      });
      prisma.user.create = jest
        .fn()
        .mockResolvedValueOnce({ id: 'usr_no_email' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce(defaultEvent);
      prisma.category.findFirst = jest
        .fn()
        .mockResolvedValueOnce(defaultCategory);
      prisma.batch.findMany = jest.fn().mockResolvedValueOnce([defaultBatch]);
      prisma.registration.create = jest
        .fn()
        .mockResolvedValueOnce({ id: 'reg_no_email' });

      // Act
      await service.create('usr_no_email', validDto);

      // Assert
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          id: 'usr_no_email',
          email: 'usr_no_email@temp-syncflow.com',
          name: 'Participante Temporário',
          role: 'PARTICIPANT',
        },
      });
    });

    // fluxo de erro se o evento não estiver publicado
    it('should throw BadRequestException if event is not PUBLISHED', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce({ id: 'usr_1' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce({
        ...defaultEvent,
        status: 'DRAFT',
      });

      // Act & Assert
      await expect(service.create('usr_1', validDto)).rejects.toThrow(
        new BadRequestException('Este evento não está aberto para inscrições'),
      );
    });

    // fluxo de erro se as inscrições ainda não tiverem sido abertas
    it('should throw BadRequestException if event registration has not opened yet', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce({ id: 'usr_1' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce({
        ...defaultEvent,
        registrationOpensAt: new Date(Date.now() + 86400000 * 5),
      });

      // Act & Assert
      await expect(service.create('usr_1', validDto)).rejects.toThrow(
        new BadRequestException(
          'As inscrições para este evento ainda não foram abertas',
        ),
      );
    });

    // fluxo de erro se o evento já foi realizado
    it('should throw BadRequestException if event date is in the past', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce({ id: 'usr_1' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce({
        ...defaultEvent,
        date: new Date(Date.now() - 86400000),
      });

      // Act & Assert
      await expect(service.create('usr_1', validDto)).rejects.toThrow(
        new BadRequestException('Este evento já foi realizado'),
      );
    });

    // fluxo de erro se o evento estiver com vagas esgotadas
    it('should throw BadRequestException if event has no available slots', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce({ id: 'usr_1' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce({
        ...defaultEvent,
        availableSlots: 0,
      });

      // Act & Assert
      await expect(service.create('usr_1', validDto)).rejects.toThrow(
        new BadRequestException('Vagas esgotadas para este evento'),
      );
    });

    // fluxo de erro se a categoria estiver com vagas esgotadas
    it('should throw BadRequestException if category has no available slots', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce({ id: 'usr_1' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce(defaultEvent);
      prisma.category.findFirst = jest.fn().mockResolvedValueOnce({
        ...defaultCategory,
        availableSlots: 0,
      });

      // Act & Assert
      await expect(service.create('usr_1', validDto)).rejects.toThrow(
        new BadRequestException('Vagas esgotadas para esta categoria'),
      );
    });

    // fluxo de erro se o lote da categoria ainda não abriu
    it('should throw BadRequestException if batch has not started yet', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce({ id: 'usr_1' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce(defaultEvent);
      prisma.category.findFirst = jest
        .fn()
        .mockResolvedValueOnce(defaultCategory);
      prisma.batch.findMany = jest.fn().mockResolvedValueOnce([
        {
          ...defaultBatch,
          type: 'DATE',
          startDate: new Date(Date.now() + 86400000 * 3),
          endDate: new Date(Date.now() + 86400000 * 10),
        },
      ]);

      // Act & Assert
      await expect(service.create('usr_1', validDto)).rejects.toThrow(
        new BadRequestException(
          'O lote de inscrições para esta categoria ainda não abriu',
        ),
      );
    });

    // fluxo com erro se o evento nao existir
    it('should throw NotFoundException if event does not exist', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce({ id: 'usr_1' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.create('usr_1', validDto)).rejects.toThrow(
        new NotFoundException('Event with ID evt_1 not found'),
      );
      expect(prisma.registration.create).not.toHaveBeenCalled();
    });

    // fluxo de validação de kit: evento sem kit rejeita shirtSize
    it('should throw BadRequestException if event has no kit but shirtSize was sent', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce({ id: 'usr_1' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce({
        ...defaultEvent,
        hasKit: false,
      });

      // Act & Assert
      await expect(service.create('usr_1', validDto)).rejects.toThrow(
        new BadRequestException('Este evento não possui kit ou camiseta'),
      );
    });

    // fluxo de validação de kit: evento com kit exige shirtSize
    it('should throw BadRequestException if event has kit but shirtSize is missing', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce({ id: 'usr_1' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce(defaultEvent);

      const dtoWithoutShirt = { ...validDto, shirtSize: undefined };

      // Act & Assert
      await expect(service.create('usr_1', dtoWithoutShirt)).rejects.toThrow(
        new BadRequestException(
          'Tamanho de camiseta é obrigatório para este evento',
        ),
      );
    });

    // fluxo de validação de kit: tamanho não configurado no evento
    it('should throw BadRequestException if shirtSize is not in event kitSizes', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce({ id: 'usr_1' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce(defaultEvent);

      const dtoInvalidShirt = { ...validDto, shirtSize: 'XXXG' };

      // Act & Assert
      await expect(service.create('usr_1', dtoInvalidShirt)).rejects.toThrow(
        new BadRequestException(
          'Tamanho de camiseta inválido. Opções disponíveis: P, M, G, GG',
        ),
      );
    });

    // fluxo com erro se a categoria não pertencer ao evento
    it('should throw BadRequestException if category does not belong to event', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce({ id: 'usr_1' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce(defaultEvent);
      prisma.category.findFirst = jest.fn().mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.create('usr_1', validDto)).rejects.toThrow(
        new BadRequestException('Categoria não encontrada para este evento'),
      );
    });

    // fluxo com erro de elegibilidade (idade abaixo da mínima)
    it('should throw UnprocessableEntityException if athlete is below minAge', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce({ id: 'usr_1' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce(defaultEvent);
      prisma.category.findFirst = jest
        .fn()
        .mockResolvedValueOnce(defaultCategory);

      // Atleta com 16 anos na data do evento (2026-10-15)
      const minorDto = {
        ...validDto,
        athleteBirthDate: '2010-01-01T00:00:00.000Z',
      };

      // Act & Assert
      await expect(service.create('usr_1', minorDto)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    // fluxo com erro quando nenhum lote estiver aberto
    it('should throw BadRequestException when all batches are closed or expired', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce({ id: 'usr_1' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce(defaultEvent);
      prisma.category.findFirst = jest
        .fn()
        .mockResolvedValueOnce(defaultCategory);
      // Lote esgotado (sold >= max)
      prisma.batch.findMany = jest.fn().mockResolvedValueOnce([
        {
          ...defaultBatch,
          soldQuantity: 100,
          maxQuantity: 100,
        },
      ]);

      // Act & Assert
      await expect(service.create('usr_1', validDto)).rejects.toThrow(
        new BadRequestException(
          'Inscrições encerradas ou nenhum lote aberto para esta categoria',
        ),
      );
    });

    // fluxo com fallback para lotes vinculados ao evento
    it('should fallback to event batches if category has no batches directly assigned', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce({ id: 'usr_1' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce(defaultEvent);
      prisma.category.findFirst = jest
        .fn()
        .mockResolvedValueOnce(defaultCategory);
      // Primeiro findMany (categoria) retorna vazio; segundo (evento) retorna o lote
      prisma.batch.findMany = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([defaultBatch]);
      prisma.registration.create = jest
        .fn()
        .mockResolvedValueOnce({ id: 'reg_fallback' });

      // Act
      const result = await service.create('usr_1', validDto);

      // Assert
      expect(prisma.batch.findMany).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ id: 'reg_fallback' });
    });
  });

  describe('findOne', () => {
    const mockReg = {
      id: 'reg_1',
      userId: 'usr_owner',
      payment: { id: 'pay_1' },
      event: { title: 'Evento 1', date: new Date() },
    };

    // fluxo de sucesso: dono da inscrição acessando
    it('should return registration details when requester is the owner', async () => {
      // Arrange
      prisma.registration.findUnique = jest.fn().mockResolvedValueOnce(mockReg);
      prisma.user.findUnique = jest
        .fn()
        .mockResolvedValueOnce({ id: 'usr_owner', role: 'PARTICIPANT' });

      // Act
      const result = await service.findOne('reg_1', { id: 'usr_owner' });

      // Assert
      expect(result).toEqual(mockReg);
    });

    // fluxo de sucesso: ADMIN acessando inscrição de outro usuário
    it('should return registration details when requester is an ADMIN', async () => {
      // Arrange
      prisma.registration.findUnique = jest.fn().mockResolvedValueOnce(mockReg);
      prisma.user.findUnique = jest
        .fn()
        .mockResolvedValueOnce({ id: 'usr_admin', role: 'ADMIN' });

      // Act
      const result = await service.findOne('reg_1', { id: 'usr_admin' });

      // Assert
      expect(result).toEqual(mockReg);
    });

    // fluxo de erro: usuário diferente que não é ADMIN
    it('should throw ForbiddenException when requester is not owner and not ADMIN', async () => {
      // Arrange
      prisma.registration.findUnique = jest.fn().mockResolvedValueOnce(mockReg);
      prisma.user.findUnique = jest
        .fn()
        .mockResolvedValueOnce({ id: 'usr_other', role: 'PARTICIPANT' });

      // Act & Assert
      await expect(
        service.findOne('reg_1', { id: 'usr_other' }),
      ).rejects.toThrow(
        new ForbiddenException('Acesso negado a esta inscrição'),
      );
    });

    // fluxo de sucesso quando requester não é informado (uso interno)
    it('should return registration details when requester is omitted', async () => {
      // Arrange
      prisma.registration.findUnique = jest.fn().mockResolvedValueOnce(mockReg);

      // Act
      const result = await service.findOne('reg_1');

      // Assert
      expect(result).toEqual(mockReg);
    });

    // fluxo com erro quando inscrição não existe
    it('should throw NotFoundException if registration is not found', async () => {
      // Arrange
      prisma.registration.findUnique = jest.fn().mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.findOne('reg_none')).rejects.toThrow(
        new NotFoundException('Registration with ID reg_none not found'),
      );
    });
  });
});
