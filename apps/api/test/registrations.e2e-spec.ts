import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/create-test-app';

describe('RegistrationsController (e2e)', () => {
  let app: INestApplication;
  let mockPrisma: any;
  let mockQueue: any;

  const authenticatedUser = {
    id: 'usr_1',
    role: 'PARTICIPANT',
  };

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'usr_1', role: 'PARTICIPANT' }),
      },
      event: {
        findUnique: jest.fn(),
      },
      category: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      batch: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      registration: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      coupon: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    };

    const testApp = await createTestApp({
      authenticatedUser,
      prismaMock: mockPrisma,
      queueMock: mockQueue,
    });
    app = testApp.app;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/registrations', () => {
    // deve criar inscricao com sucesso e enfileirar para processamento
    it('should create registration and enqueue job for background processing', async () => {
      // Arrange
      const eventDate = new Date('2026-12-01');
      mockPrisma.event.findUnique.mockResolvedValueOnce({
        id: 'evt_1',
        title: 'Maratona 2026',
        date: eventDate,
        hasKit: true,
        kitSizes: ['P', 'M', 'G', 'GG'],
        availableSlots: 100,
        tenantId: 'ten_1',
      });

      mockPrisma.category.findFirst.mockResolvedValueOnce({
        id: 'cat_1',
        eventId: 'evt_1',
        name: 'Geral',
        minAge: 18,
        maxAge: 60,
        gender: null,
        availableSlots: 50,
      });

      const now = new Date();
      mockPrisma.batch.findMany.mockResolvedValueOnce([
        {
          id: 'bat_1',
          categoryId: 'cat_1',
          eventId: 'evt_1',
          name: 'Lote 1',
          price: 100.0,
          position: 1,
          active: true,
          type: 'DATE',
          startDate: new Date(now.getTime() - 1000 * 60 * 60 * 24),
          endDate: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 10),
          maxQuantity: 100,
          soldQuantity: 10,
        },
      ]);

      mockPrisma.registration.create.mockResolvedValueOnce({
        id: 'reg_123',
        userId: 'usr_1',
        eventId: 'evt_1',
        categoryId: 'cat_1',
        batchId: 'bat_1',
        status: 'QUEUED',
        amountPaid: 100.0,
      });

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/registrations')
        .send({
          eventId: 'evt_1',
          categoryId: 'cat_1',
          batchId: 'bat_1',
          paymentMethod: 'PIX',
          athleteBirthDate: '1995-05-10T00:00:00.000Z',
          athleteGender: 'MASCULINO',
          shirtSize: 'M',
        });

      // Assert
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: 'reg_123',
        status: 'QUEUED',
      });
      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-registration',
        expect.objectContaining({
          registrationId: 'reg_123',
          userId: 'usr_1',
          eventId: 'evt_1',
        }),
        expect.any(Object),
      );
    });

    // deve rejeitar inscricao se o atleta nao cumprir os requisitos de idade da categoria
    it('should reject registration if athlete is ineligible by age for the category', async () => {
      // Arrange
      const eventDate = new Date('2026-12-01');
      mockPrisma.event.findUnique.mockResolvedValueOnce({
        id: 'evt_1',
        title: 'Corrida Master',
        date: eventDate,
        hasKit: false,
        availableSlots: 100,
        tenantId: 'ten_1',
      });

      mockPrisma.category.findFirst.mockResolvedValueOnce({
        id: 'cat_master',
        eventId: 'evt_1',
        name: 'Master 50+',
        minAge: 50,
        maxAge: 100,
        gender: null,
        availableSlots: 20,
      });

      // Act: Atleta de 25 anos tentando categoria de 50+
      const response = await request(app.getHttpServer())
        .post('/api/registrations')
        .send({
          eventId: 'evt_1',
          categoryId: 'cat_master',
          batchId: 'bat_1',
          paymentMethod: 'PIX',
          athleteBirthDate: '2001-01-01T00:00:00.000Z',
          athleteGender: 'MASCULINO',
        });

      // Assert
      expect(response.status).toBe(422);
      expect(response.body.message).toContain('Idade mínima');
    });

    // deve rejeitar inscricao se o evento possui kit obrigatorio mas o tamanho nao foi informado
    it('should reject registration if event has kit and shirt size is missing', async () => {
      // Arrange
      mockPrisma.event.findUnique.mockResolvedValueOnce({
        id: 'evt_kit',
        title: 'Corrida com Kit',
        date: new Date('2026-12-01'),
        hasKit: true,
        availableSlots: 100,
        tenantId: 'ten_1',
      });

      mockPrisma.category.findFirst.mockResolvedValueOnce({
        id: 'cat_1',
        eventId: 'evt_kit',
        name: 'Geral',
        minAge: null,
        maxAge: null,
        gender: null,
        availableSlots: 50,
      });

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/registrations')
        .send({
          eventId: 'evt_kit',
          categoryId: 'cat_1',
          batchId: 'bat_1',
          paymentMethod: 'PIX',
          athleteBirthDate: '1995-05-10T00:00:00.000Z',
          athleteGender: 'MASCULINO',
          complementaryData: {},
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.message.toLowerCase()).toContain('camiseta');
    });
  });

  describe('GET /api/registrations/:id', () => {
    // deve retornar os detalhes da inscricao pertencente ao usuario logado
    it('should return registration details for the registration owner', async () => {
      // Arrange
      mockPrisma.registration.findUnique.mockResolvedValueOnce({
        id: 'reg_own',
        userId: 'usr_1',
        status: 'CONFIRMED',
        amountPaid: 110.0,
        payment: { status: 'PAID' },
        event: { title: 'Maratona' },
      });

      // Act
      const response = await request(app.getHttpServer()).get(
        '/api/registrations/reg_own',
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.id).toBe('reg_own');
      expect(response.body.status).toBe('CONFIRMED');
    });

    // deve proibir acesso se a inscricao pertencer a outro usuario
    it('should return 403 if registration belongs to another user', async () => {
      // Arrange
      mockPrisma.registration.findUnique.mockResolvedValueOnce({
        id: 'reg_other',
        userId: 'other_user_id',
        status: 'CONFIRMED',
      });

      // Act
      const response = await request(app.getHttpServer()).get(
        '/api/registrations/reg_other',
      );

      // Assert
      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/registrations/:id/receipt', () => {
    // deve retornar stream do PDF de comprovante para inscricao confirmada
    it('should stream PDF receipt for confirmed registration', async () => {
      // Arrange
      mockPrisma.registration.findUnique.mockResolvedValueOnce({
        id: 'reg_receipt',
        userId: 'usr_1',
        status: 'CONFIRMED',
        receiptCode: 'REC-9999-AAAA',
        athleteBirthDate: new Date('1990-01-01'),
        athleteGender: 'MASCULINO',
        amountPaid: 100,
        metadata: { shirtSize: 'M' },
        user: { name: 'Atleta Exemplo', cpf: '12345678900' },
        event: {
          title: 'Maratona Oficial',
          date: new Date('2026-11-20'),
          location: 'Parque Ibirapuera',
          hasKit: true,
        },
        category: { name: '10KM' },
        batch: { name: '1º Lote' },
      });

      // Act
      const response = await request(app.getHttpServer()).get(
        '/api/registrations/reg_receipt/receipt',
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain(
        'comprovante-REC-9999-AAAA.pdf',
      );
      expect(response.body).toBeInstanceOf(Buffer);
    });

    // deve retornar erro 409 se a inscricao ainda nao foi confirmada
    it('should return 409 if registration is not confirmed yet', async () => {
      // Arrange
      mockPrisma.registration.findUnique.mockResolvedValueOnce({
        id: 'reg_pending',
        userId: 'usr_1',
        status: 'PENDING',
      });

      // Act
      const response = await request(app.getHttpServer()).get(
        '/api/registrations/reg_pending/receipt',
      );

      // Assert
      expect(response.status).toBe(409);
      expect(response.body.message).toContain('inscrições confirmadas');
    });
  });

  describe('GET /api/verificar/:code (Public verification)', () => {
    // deve retornar dados publicos sanitizados para codigo de comprovante valido
    it('should return sanitized public verification info for valid receipt code', async () => {
      // Arrange
      mockPrisma.registration.findUnique.mockResolvedValueOnce({
        id: 'reg_valid',
        receiptCode: 'REC-ABCD-1234',
        status: 'CONFIRMED',
        user: { name: 'Carlos Eduardo Silva' },
        event: { title: 'Corrida das Flores', date: new Date('2026-09-15') },
        category: { name: '5KM' },
      });

      // Act
      const response = await request(app.getHttpServer()).get(
        '/api/verificar/rec-abcd-1234',
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        valid: true,
        receiptCode: 'REC-ABCD-1234',
        status: 'CONFIRMED',
        athleteName: 'Carlos E. S.',
        eventName: 'Corrida das Flores',
        eventDate: expect.any(String),
        categoryName: '5KM',
      });
      // Verifica que dados sensíveis NAO sao expostos
      expect(response.body.athleteCpf).toBeUndefined();
      expect(response.body.athleteEmail).toBeUndefined();
      expect(response.body.userId).toBeUndefined();
    });

    // deve retornar 404 se o comprovante nao for encontrado
    it('should return 404 if receipt code is not found', async () => {
      // Arrange
      mockPrisma.registration.findUnique.mockResolvedValueOnce(null);

      // Act
      const response = await request(app.getHttpServer()).get(
        '/api/verificar/REC-INEXISTENTE',
      );

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Comprovante não encontrado');
    });
  });
});
