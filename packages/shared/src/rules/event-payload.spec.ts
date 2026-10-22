import { describe, it, expect } from 'vitest';
import { validateEventPayload, normalizeEventPayload, EventPayloadInput } from './event-payload';

describe('validateEventPayload', () => {
  const referenceNow = new Date('2026-05-01T12:00:00.000Z');

  // Deve validar com sucesso um evento válido com kit e taxa administrativa definida
  it('should pass validation for a valid event with kit and valid admin fee rate', () => {
    // Arrange
    const payload: EventPayloadInput = {
      name: 'Circuito das Estações',
      date: '2026-10-15T08:00:00.000Z',
      registrationOpensAt: '2026-06-01T00:00:00.000Z',
      hasKit: true,
      kitSizes: ['P', 'M', 'G', 'GG'],
      adminFeeRate: 7.5,
    };

    // Act
    const result = validateEventPayload(payload, referenceNow);

    // Assert
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // Deve falhar quando hasKit for true mas kitSizes estiver vazio
  it('should fail when hasKit is true but kitSizes is empty', () => {
    // Arrange
    const payload: EventPayloadInput = {
      name: 'Corrida Rápida',
      date: '2026-10-15T08:00:00.000Z',
      hasKit: true,
      kitSizes: [],
    };

    // Act
    const result = validateEventPayload(payload, referenceNow);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ao menos um tamanho'))).toBe(true);
  });

  // Deve falhar quando kitSizes contiver tamanhos vazios ou duplicados
  it('should fail when kitSizes contains blank strings or duplicates', () => {
    // Arrange
    const payload: EventPayloadInput = {
      name: 'Corrida Rápida',
      date: '2026-10-15T08:00:00.000Z',
      hasKit: true,
      kitSizes: ['M', 'M', ' '],
    };

    // Act
    const result = validateEventPayload(payload, referenceNow);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicados ou vazios'))).toBe(true);
  });

  // Deve aceitar adminFeeRate como 0% e como 100%
  it('should accept adminFeeRate of 0% and 100%', () => {
    // Arrange
    const payloadZero: EventPayloadInput = {
      name: 'Corrida Beneficente',
      date: '2026-10-15T08:00:00.000Z',
      adminFeeRate: 0,
    };
    const payloadHundred: EventPayloadInput = {
      name: 'Corrida VIP',
      date: '2026-10-15T08:00:00.000Z',
      adminFeeRate: 100,
    };

    // Act & Assert
    expect(validateEventPayload(payloadZero, referenceNow).valid).toBe(true);
    expect(validateEventPayload(payloadHundred, referenceNow).valid).toBe(true);
  });

  // Deve falhar quando adminFeeRate for negativo ou maior que 100%
  it('should fail when adminFeeRate is negative or greater than 100', () => {
    // Arrange
    const payloadNegative: EventPayloadInput = {
      name: 'Corrida Inválida',
      date: '2026-10-15T08:00:00.000Z',
      adminFeeRate: -2,
    };
    const payloadExcess: EventPayloadInput = {
      name: 'Corrida Inválida',
      date: '2026-10-15T08:00:00.000Z',
      adminFeeRate: 105,
    };

    // Act & Assert
    expect(validateEventPayload(payloadNegative, referenceNow).valid).toBe(false);
    expect(validateEventPayload(payloadExcess, referenceNow).valid).toBe(false);
  });

  // Deve falhar quando adminFeeRate for NaN
  it('should fail when adminFeeRate is NaN or non-numeric string', () => {
    // Arrange
    const payload: EventPayloadInput = {
      name: 'Corrida Inválida',
      date: '2026-10-15T08:00:00.000Z',
      adminFeeRate: 'invalido',
    };

    // Act
    const result = validateEventPayload(payload, referenceNow);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('taxa administrativa'))).toBe(true);
  });

  // Deve aceitar adminFeeRate como null ou undefined (herdar do tenant)
  it('should accept null or undefined adminFeeRate representing inheritance from tenant', () => {
    // Arrange
    const payload: EventPayloadInput = {
      name: 'Corrida Padrão',
      date: '2026-10-15T08:00:00.000Z',
      adminFeeRate: null,
    };

    // Act
    const result = validateEventPayload(payload, referenceNow);

    // Assert
    expect(result.valid).toBe(true);
  });

  // Deve falhar quando a data do evento estiver no passado
  it('should fail when event date is in the past', () => {
    // Arrange: evento no passado em relação a referenceNow
    const payload: EventPayloadInput = {
      name: 'Corrida Passada',
      date: '2026-04-01T08:00:00.000Z',
    };

    // Act
    const result = validateEventPayload(payload, referenceNow);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('passado'))).toBe(true);
  });

  // Deve aceitar now como string ISO e também com valor padrão omitido
  it('should accept now as ISO string and when omitted with default Date', () => {
    // Arrange
    const payloadFuture: EventPayloadInput = {
      name: 'Corrida Futura',
      date: new Date(Date.now() + 86400000 * 30),
    };

    // Act & Assert
    expect(validateEventPayload(payloadFuture, '2026-01-01T00:00:00.000Z').valid).toBe(true);
    expect(validateEventPayload(payloadFuture).valid).toBe(true);
  });

  // Deve validar com sucesso evento sem data ou com adminFeeRate como string em branco
  it('should pass validation when date is omitted and adminFeeRate is whitespace string', () => {
    // Arrange
    const payload: EventPayloadInput = {
      name: 'Evento Rascunho',
      adminFeeRate: '   ',
    };

    // Act
    const result = validateEventPayload(payload, referenceNow);

    // Assert
    expect(result.valid).toBe(true);
  });

  // Deve falhar quando hasKit for true mas kitSizes for undefined
  it('should fail when hasKit is true but kitSizes is undefined', () => {
    // Arrange
    const payload: EventPayloadInput = {
      name: 'Corrida Com Kit Sem Lista',
      hasKit: true,
      kitSizes: undefined,
    };

    // Act
    const result = validateEventPayload(payload, referenceNow);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ao menos um tamanho'))).toBe(true);
  });

  // Deve falhar quando registrationOpensAt for posterior ou igual à data do evento
  it('should fail when registrationOpensAt is after or equal to event date', () => {
    // Arrange
    const payload: EventPayloadInput = {
      name: 'Corrida Data Inválida',
      date: '2026-10-15T08:00:00.000Z',
      registrationOpensAt: '2026-10-16T00:00:00.000Z',
    };

    // Act
    const result = validateEventPayload(payload, referenceNow);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('anterior à data do evento'))).toBe(true);
  });
});

describe('normalizeEventPayload', () => {
  // Deve descartar kitSizes se hasKit for falso
  it('should empty kitSizes when hasKit is false', () => {
    // Arrange
    const payload: EventPayloadInput = {
      name: 'Corrida Sem Kit',
      hasKit: false,
      kitSizes: ['P', 'M', 'G'],
      adminFeeRate: '5.5',
    };

    // Act
    const normalized = normalizeEventPayload(payload);

    // Assert
    expect(normalized.hasKit).toBe(false);
    expect(normalized.kitSizes).toEqual([]);
    expect(normalized.adminFeeRate).toBe(5.5);
  });

  // Deve limpar espaços em branco e remover duplicados dos tamanhos quando hasKit for true
  it('should trim and deduplicate kitSizes when hasKit is true', () => {
    // Arrange
    const payload: EventPayloadInput = {
      name: 'Corrida Com Kit',
      hasKit: true,
      kitSizes: [' P ', 'M', 'P', ' G '],
    };

    // Act
    const normalized = normalizeEventPayload(payload);

    // Assert
    expect(normalized.kitSizes).toEqual(['P', 'M', 'G']);
  });

  // Deve converter adminFeeRate string vazia ou null para null
  it('should normalize empty string or null adminFeeRate to null', () => {
    // Arrange
    const payload: EventPayloadInput = {
      adminFeeRate: '',
    };

    // Act
    const normalized = normalizeEventPayload(payload);

    // Assert
    expect(normalized.adminFeeRate).toBeNull();
  });
});
