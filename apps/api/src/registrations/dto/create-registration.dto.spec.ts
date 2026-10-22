import { ValidationPipe, ArgumentMetadata } from '@nestjs/common';
import { CreateRegistrationDto } from './create-registration.dto';

describe('CreateRegistrationDto', () => {
  let target: ValidationPipe;
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateRegistrationDto,
  };

  beforeEach(() => {
    target = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
  });

  // Deve validar com sucesso um payload completo válido
  it('should validate a valid registration payload successfully', async () => {
    // Arrange
    const payload = {
      eventId: 'evt-123',
      categoryId: 'cat-456',
      athleteBirthDate: '1995-05-20T00:00:00.000Z',
      athleteGender: 'MASCULINO',
      shirtSize: 'M',
      couponCode: 'PROMO10',
      paymentMethod: 'PIX',
    };

    // Act
    const result = await target.transform(payload, metadata);

    // Assert
    expect(result).toBeDefined();
    expect(result.eventId).toBe('evt-123');
    expect(result.categoryId).toBe('cat-456');
    expect(result.athleteBirthDate).toBe('1995-05-20T00:00:00.000Z');
    expect(result.athleteGender).toBe('MASCULINO');
    expect(result.shirtSize).toBe('M');
  });

  // Deve falhar quando campos obrigatórios estiverem ausentes
  it('should fail when required fields eventId or categoryId are missing', async () => {
    // Arrange
    const payloadMissingEvent = {
      categoryId: 'cat-456',
      athleteBirthDate: '1995-05-20T00:00:00.000Z',
      athleteGender: 'MASCULINO',
    };

    // Act & Assert
    await expect(
      target.transform(payloadMissingEvent, metadata),
    ).rejects.toThrow();
  });

  // Deve falhar quando athleteBirthDate não for formato ISO 8601
  it('should fail when athleteBirthDate is not a valid ISO date', async () => {
    // Arrange
    const payload = {
      eventId: 'evt-123',
      categoryId: 'cat-456',
      athleteBirthDate: '20-05-1995', // Não é ISO
      athleteGender: 'MASCULINO',
    };

    // Act & Assert
    await expect(target.transform(payload, metadata)).rejects.toThrow();
  });

  // Deve falhar quando athleteGender for diferente de MASCULINO ou FEMININO
  it('should fail when athleteGender is not MASCULINO or FEMININO', async () => {
    // Arrange
    const payload = {
      eventId: 'evt-123',
      categoryId: 'cat-456',
      athleteBirthDate: '1995-05-20T00:00:00.000Z',
      athleteGender: 'OUTRO',
    };

    // Act & Assert
    await expect(target.transform(payload, metadata)).rejects.toThrow();
  });

  // Deve rejeitar campos desconhecidos devido ao forbidNonWhitelisted
  it('should reject unknown fields when forbidNonWhitelisted is active', async () => {
    // Arrange
    const payload = {
      eventId: 'evt-123',
      categoryId: 'cat-456',
      athleteBirthDate: '1995-05-20T00:00:00.000Z',
      athleteGender: 'FEMININO',
      campoInvasor: 'hacker',
    };

    // Act & Assert
    await expect(target.transform(payload, metadata)).rejects.toThrow();
  });

  // Deve aceitar shirtSize como opcional
  it('should accept payload without shirtSize as it is optional in DTO level', async () => {
    // Arrange
    const payload = {
      eventId: 'evt-123',
      categoryId: 'cat-456',
      athleteBirthDate: '1995-05-20T00:00:00.000Z',
      athleteGender: 'FEMININO',
    };

    // Act
    const result = await target.transform(payload, metadata);

    // Assert
    expect(result).toBeDefined();
    expect(result.shirtSize).toBeUndefined();
  });
});
