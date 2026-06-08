import { Test, TestingModule } from '@nestjs/testing';
import { RegistrationsService } from './registrations.service';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';
import { QueueName } from '@syncflow/shared';
import { NotFoundException } from '@nestjs/common';
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
    mockClerkClientInstance = (createClerkClient as jest.Mock).mock.results[0].value;
  });

  describe('create', () => {
    const createDto = {
      eventId: 'evt_1',
      categoryId: 'cat_1',
      batchId: 'bat_1',
      couponCode: 'SALE10',
      complementaryData: { size: 'G' },
    };

    // fluxo de sucesso com usuario existente
    it('should create registration and enqueue job when user already exists', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce({ id: 'usr_1' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce({ id: 'evt_1', tenantId: 'ten_1' });
      prisma.registration.create = jest.fn().mockResolvedValueOnce({ id: 'reg_1' });

      // Act
      const result = await service.create('usr_1', createDto);

      // Assert
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'usr_1' } });
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { id: 'evt_1' } });
      expect(prisma.registration.create).toHaveBeenCalledWith({
        data: {
          eventId: 'evt_1',
          categoryId: 'cat_1',
          batchId: 'bat_1',
          userId: 'usr_1',
          tenantId: 'ten_1',
          status: 'QUEUED',
          paymentStatus: 'PENDING',
          amountPaid: 0,
          metadata: { size: 'G', paymentMethod: 'PIX', cardDetails: null },
        },
      });
      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-registration',
        expect.objectContaining({ registrationId: 'reg_1', couponCode: 'SALE10' }),
        expect.any(Object)
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
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce({ id: 'evt_1', tenantId: 'ten_1' });
      prisma.registration.create = jest.fn().mockResolvedValueOnce({ id: 'reg_2' });

      // Act
      await service.create('usr_2', createDto);

      // Assert
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'usr_2' } });
      expect(mockClerkClientInstance.users.getUser).toHaveBeenCalledWith('usr_2');
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
      mockClerkClientInstance.users.getUser.mockRejectedValueOnce(new Error('Clerk offline'));
      prisma.user.create = jest.fn().mockResolvedValueOnce({ id: 'usr_3' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce({ id: 'evt_1', tenantId: 'ten_1' });
      prisma.registration.create = jest.fn().mockResolvedValueOnce({ id: 'reg_3' });

      // Act
      await service.create('usr_3', createDto);

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
        emailAddresses: [], // sem e-mail
      });
      prisma.user.create = jest.fn().mockResolvedValueOnce({ id: 'usr_no_email' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce({ id: 'evt_1', tenantId: 'ten_1' });
      prisma.registration.create = jest.fn().mockResolvedValueOnce({ id: 'reg_no_email' });

      // Act
      await service.create('usr_no_email', createDto);

      // Assert
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          id: 'usr_no_email',
          email: 'usr_no_email@temp-syncflow.com', // fallback
          name: 'Participante Temporário',
          role: 'PARTICIPANT',
        },
      });
    });

    // fluxo com erro se o evento nao existir
    it('should throw NotFoundException if event does not exist', async () => {
      // Arrange
      prisma.user.findUnique = jest.fn().mockResolvedValueOnce({ id: 'usr_1' });
      prisma.event.findUnique = jest.fn().mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.create('usr_1', createDto)).rejects.toThrow(
        new NotFoundException('Event with ID evt_1 not found'),
      );
      expect(prisma.registration.create).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    // fluxo de sucesso
    it('should return registration details if it exists', async () => {
      // Arrange
      const mockReg = {
        id: 'reg_1',
        payment: { id: 'pay_1' },
        event: { title: 'Evento 1' },
      };
      prisma.registration.findUnique = jest.fn().mockResolvedValueOnce(mockReg);

      // Act
      const result = await service.findOne('reg_1');

      // Assert
      expect(prisma.registration.findUnique).toHaveBeenCalledWith({
        where: { id: 'reg_1' },
        include: {
          payment: true,
          event: { select: { title: true, date: true } },
        },
      });
      expect(result).toEqual(mockReg);
    });

    // fluxo com erro
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
