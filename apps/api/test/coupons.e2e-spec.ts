import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/create-test-app';

describe('CouponsController (e2e)', () => {
  let app: INestApplication;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      coupon: {
        findUnique: jest.fn(),
      },
    };

    const testApp = await createTestApp({
      prismaMock: mockPrisma,
    });
    app = testApp.app;
  });

  afterEach(async () => {
    await app.close();
  });

  // deve validar com sucesso cupom ativo e retornar dados do desconto
  it('should successfully validate active coupon and return discount details', async () => {
    // Arrange
    const now = new Date();
    const futureDate = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7);

    mockPrisma.coupon.findUnique.mockResolvedValueOnce({
      id: 'coup_1',
      code: 'PROMO10',
      eventId: 'evt_1',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      active: true,
      maxUses: 100,
      usedCount: 5,
      validUntil: futureDate,
    });

    // Act
    const response = await request(app.getHttpServer())
      .post('/api/coupons/validate')
      .send({
        code: 'promo10',
        eventId: 'evt_1',
      });

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      valid: true,
      code: 'PROMO10',
      discountType: 'PERCENTAGE',
      discountValue: 10,
    });
  });

  // deve retornar erro 400 se o cupom expirou por data
  it('should return 400 if coupon is expired by date', async () => {
    // Arrange
    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24);

    mockPrisma.coupon.findUnique.mockResolvedValueOnce({
      id: 'coup_expired',
      code: 'EXPIRED',
      eventId: 'evt_1',
      discountType: 'FIXED',
      discountValue: 20,
      active: true,
      maxUses: 100,
      usedCount: 0,
      validUntil: pastDate,
    });

    // Act
    const response = await request(app.getHttpServer())
      .post('/api/coupons/validate')
      .send({
        code: 'EXPIRED',
        eventId: 'evt_1',
      });

    // Assert
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('expirado');
  });

  // deve retornar erro 400 se o cupom atingiu o limite maximo de usos
  it('should return 400 if coupon reached maximum uses', async () => {
    // Arrange
    mockPrisma.coupon.findUnique.mockResolvedValueOnce({
      id: 'coup_exhausted',
      code: 'ESGOTADO',
      eventId: 'evt_1',
      discountType: 'PERCENTAGE',
      discountValue: 50,
      active: true,
      maxUses: 10,
      usedCount: 10,
      validUntil: null,
    });

    // Act
    const response = await request(app.getHttpServer())
      .post('/api/coupons/validate')
      .send({
        code: 'ESGOTADO',
        eventId: 'evt_1',
      });

    // Assert
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('limite');
  });

  // deve retornar erro 404 se o cupom nao for encontrado para o evento
  it('should return 404 if coupon is not found for the event', async () => {
    // Arrange
    mockPrisma.coupon.findUnique.mockResolvedValueOnce(null);

    // Act
    const response = await request(app.getHttpServer())
      .post('/api/coupons/validate')
      .send({
        code: 'INVALIDO',
        eventId: 'evt_1',
      });

    // Assert
    expect(response.status).toBe(404);
    expect(response.body.message).toContain('não encontrado');
  });

  // deve retornar erro 400 se o cupom estiver inativo
  it('should return 400 if coupon is inactive', async () => {
    // Arrange
    mockPrisma.coupon.findUnique.mockResolvedValueOnce({
      id: 'coup_inact',
      code: 'INATIVO',
      eventId: 'evt_1',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      active: false,
      maxUses: 100,
      usedCount: 0,
      validUntil: null,
    });

    // Act
    const response = await request(app.getHttpServer())
      .post('/api/coupons/validate')
      .send({
        code: 'INATIVO',
        eventId: 'evt_1',
      });

    // Assert
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('inativo');
  });

  // deve retornar 400 por falha de validacao se os campos obrigatorios estiverem ausentes
  it('should return 400 validation error if required fields are missing', async () => {
    // Act
    const response = await request(app.getHttpServer())
      .post('/api/coupons/validate')
      .send({});

    // Assert
    expect(response.status).toBe(400);
    expect(Array.isArray(response.body.message)).toBe(true);
  });
});
