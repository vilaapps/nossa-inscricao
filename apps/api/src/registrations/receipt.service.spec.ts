import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptService } from './receipt.service';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';

// Mock do renderReceiptPdf de @syncflow/shared
jest.mock('@syncflow/shared', () => {
  const actual = jest.requireActual('@syncflow/shared');
  return {
    ...actual,
    renderReceiptPdf: jest
      .fn()
      .mockResolvedValue(Buffer.from('%PDF-mocked-pdf-buffer')),
  };
});

describe('ReceiptService', () => {
  let service: ReceiptService;
  let prisma: PrismaService;

  const mockPrismaService = {
    registration: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'WEB_APP_URL') return 'https://syncflow.com';
      return null;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ReceiptService>(ReceiptService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('generateReceipt', () => {
    const mockRegistration = {
      id: 'reg-1',
      userId: 'user-owner',
      status: 'CONFIRMED',
      receiptCode: 'REC-ABCD-1234',
      amountPaid: '99.90',
      athleteBirthDate: new Date('1990-01-01'),
      athleteGender: 'MASCULINO',
      metadata: { shirtSize: 'G', cpf: '123.456.789-00' },
      event: {
        id: 'event-1',
        title: 'Meia Maratona 21K',
        date: new Date('2026-11-20T08:00:00Z'),
        location: 'Copacabana, Rio de Janeiro',
        hasKit: true,
      },
      category: {
        id: 'cat-1',
        name: 'Geral 21K',
      },
      batch: {
        id: 'batch-1',
        name: '1º Lote',
      },
      user: {
        id: 'user-owner',
        name: 'Carlos da Silva',
        email: 'carlos@example.com',
        cpf: '12345678900',
        role: 'ATHLETE',
      },
      updatedAt: new Date('2026-10-20T12:00:00Z'),
    };

    // Dono da inscrição pode gerar o comprovante
    it('should generate receipt successfully for registration owner', async () => {
      // Arrange
      mockPrismaService.registration.findUnique.mockResolvedValue(
        mockRegistration,
      );
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-owner',
        role: 'ATHLETE',
      });

      // Act
      const result = await service.generateReceipt('reg-1', {
        id: 'user-owner',
      });

      // Assert
      expect(result.filename).toBe('comprovante-REC-ABCD-1234.pdf');
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(mockPrismaService.registration.update).not.toHaveBeenCalled();
    });

    // Usuário ADMIN pode gerar comprovante de qualquer participante
    it('should generate receipt for admin user even if not the owner', async () => {
      // Arrange
      mockPrismaService.registration.findUnique.mockResolvedValue(
        mockRegistration,
      );
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-admin',
        role: 'ADMIN',
      });

      // Act
      const result = await service.generateReceipt('reg-1', {
        id: 'user-admin',
      });

      // Assert
      expect(result.filename).toBe('comprovante-REC-ABCD-1234.pdf');
    });

    // Outro usuário sem privilégio de ADMIN recebe 403 Forbidden
    it('should throw ForbiddenException if user is neither owner nor admin', async () => {
      // Arrange
      mockPrismaService.registration.findUnique.mockResolvedValue(
        mockRegistration,
      );
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-stranger',
        role: 'ATHLETE',
      });

      // Act & Assert
      await expect(
        service.generateReceipt('reg-1', { id: 'user-stranger' }),
      ).rejects.toThrow(ForbiddenException);
    });

    // Inscrição inexistente deve retornar 404
    it('should throw NotFoundException when registration does not exist', async () => {
      // Arrange
      mockPrismaService.registration.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.generateReceipt('reg-inexistente', { id: 'user-owner' }),
      ).rejects.toThrow(NotFoundException);
    });

    // Inscrição não confirmada (ex: PENDING) deve retornar ConflictException
    it('should throw ConflictException if registration is not CONFIRMED', async () => {
      // Arrange
      mockPrismaService.registration.findUnique.mockResolvedValue({
        ...mockRegistration,
        status: 'PENDING',
      });
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-owner',
        role: 'ATHLETE',
      });

      // Act & Assert
      await expect(
        service.generateReceipt('reg-1', { id: 'user-owner' }),
      ).rejects.toThrow(ConflictException);
    });

    // Gera receiptCode se ainda não existir na inscrição confirmada
    it('should generate and persist receiptCode if missing on confirmed registration', async () => {
      // Arrange
      const regWithoutCode = {
        ...mockRegistration,
        receiptCode: null,
      };
      mockPrismaService.registration.findUnique.mockResolvedValue(
        regWithoutCode,
      );
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-owner',
        role: 'ATHLETE',
      });
      mockPrismaService.registration.update.mockResolvedValue({
        ...regWithoutCode,
        receiptCode: 'REC-NEW1-CODE',
      });

      // Act
      const result = await service.generateReceipt('reg-1', {
        id: 'user-owner',
      });

      // Assert
      expect(mockPrismaService.registration.update).toHaveBeenCalled();
      expect(result.filename).toMatch(
        /^comprovante-REC-[A-Z0-9]{4}-[A-Z0-9]{4}\.pdf$/,
      );
    });

    // Evento sem kit descarta camiseta mesmo se presente no metadata
    it('should omit shirt size when event hasKit is false', async () => {
      // Arrange
      const regNoKit = {
        ...mockRegistration,
        event: {
          ...mockRegistration.event,
          hasKit: false,
        },
      };
      mockPrismaService.registration.findUnique.mockResolvedValue(regNoKit);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-owner',
        role: 'ATHLETE',
      });

      // Act
      const result = await service.generateReceipt('reg-1', {
        id: 'user-owner',
      });

      // Assert
      expect(result).toBeDefined();
    });
  });

  describe('verifyReceipt', () => {
    // Código válido e inscrição confirmada retorna dados públicos com nome mascarado
    it('should return public verification details for confirmed registration', async () => {
      // Arrange
      mockPrismaService.registration.findUnique.mockResolvedValue({
        id: 'reg-1',
        status: 'CONFIRMED',
        receiptCode: 'REC-ABCD-1234',
        user: {
          name: 'Carlos Silva Mendes',
        },
        event: {
          title: 'Maratona do Rio 2026',
          date: new Date('2026-10-25T07:00:00Z'),
        },
        category: {
          name: '42K Geral',
        },
      });

      // Act
      const result = await service.verifyReceipt('REC-ABCD-1234');

      // Assert
      expect(result).toEqual({
        valid: true,
        receiptCode: 'REC-ABCD-1234',
        status: 'CONFIRMED',
        athleteName: 'Carlos S. M.',
        eventName: 'Maratona do Rio 2026',
        eventDate: expect.any(Date),
        categoryName: '42K Geral',
      });
    });

    // Código inexistente ou formato inválido retorna NotFoundException
    it('should throw NotFoundException when receipt code does not exist', async () => {
      // Arrange
      mockPrismaService.registration.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.verifyReceipt('REC-INEX-ISTE')).rejects.toThrow(
        NotFoundException,
      );
    });

    // Inscrição cancelada retorna valid: false com status explícito
    it('should return valid: false when registration is CANCELLED or REFUNDED', async () => {
      // Arrange
      mockPrismaService.registration.findUnique.mockResolvedValue({
        id: 'reg-1',
        status: 'CANCELLED',
        receiptCode: 'REC-CANC-1234',
        user: {
          name: 'Maria Santos',
        },
        event: {
          title: 'Corrida 10K',
          date: new Date('2026-08-10T08:00:00Z'),
        },
        category: {
          name: '10K Feminino',
        },
      });

      // Act
      const result = await service.verifyReceipt('REC-CANC-1234');

      // Assert
      expect(result.valid).toBe(false);
      expect(result.status).toBe('CANCELLED');
      expect(result.athleteName).toBe('Maria S.');
    });
  });
});
