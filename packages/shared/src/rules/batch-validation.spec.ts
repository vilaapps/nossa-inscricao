import { describe, it, expect } from 'vitest';
import {
  validateBatchPlan,
  BatchValidationInput,
  CategoryValidationInput,
  EventValidationInput,
} from './batch-validation';

describe('validateBatchPlan', () => {
  const event: EventValidationInput = {
    date: '2026-10-01T08:00:00.000Z',
    registrationOpensAt: '2026-05-01T00:00:00.000Z',
  };

  const category: CategoryValidationInput = {
    name: '10KM Geral',
    totalSlots: 100,
  };

  // Deve falhar quando a lista de lotes for nula ou vazia
  it('should return error when batches is null or empty', () => {
    // Arrange & Act
    const resultEmpty = validateBatchPlan([], category, event);
    const resultNull = validateBatchPlan(null as any, category, event);

    // Assert
    expect(resultEmpty.valid).toBe(false);
    expect(resultNull.valid).toBe(false);
  });

  // Deve validar com sucesso quando o evento não possui registrationOpensAt definido
  it('should validate successfully when event has no registrationOpensAt', () => {
    // Arrange
    const batches: BatchValidationInput[] = [
      {
        name: '1º Lote',
        type: 'DATE',
        position: 1,
        price: 50,
        startDate: '2026-06-01T00:00:00.000Z',
        endDate: '2026-06-30T23:59:59.999Z',
      },
    ];

    // Act
    const result = validateBatchPlan(batches, category, { date: event.date });

    // Assert
    expect(result.valid).toBe(true);
  });

  // Deve falhar quando existirem posições duplicadas ou inválidas
  it('should return error when batches have duplicate or non-positive positions', () => {
    // Arrange
    const batches: BatchValidationInput[] = [
      {
        name: 'Lote 1',
        type: 'QUANTITY',
        position: 1,
        price: 50,
        maxQuantity: 50,
      },
      {
        name: 'Lote 2',
        type: 'QUANTITY',
        position: 1, // duplicado
        price: 60,
        maxQuantity: 50,
      },
    ];

    // Act
    const result = validateBatchPlan(batches, category, event);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('posições'))).toBe(true);
  });

  // Deve exigir que o 1º lote DATE coincida com a data de abertura das inscrições
  it('should require the first DATE batch startDate to match registrationOpensAt', () => {
    // Arrange: 1º lote começa depois da abertura
    const batches: BatchValidationInput[] = [
      {
        name: '1º Lote',
        type: 'DATE',
        position: 1,
        price: 50,
        startDate: '2026-05-10T00:00:00.000Z', // diferente de 2026-05-01
        endDate: '2026-05-20T23:59:59.999Z',
      },
    ];

    // Act
    const result = validateBatchPlan(batches, category, event);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('abertura das inscrições'))).toBe(true);
  });

  // Deve aceitar quando o 1º lote DATE coincide com registrationOpensAt
  it('should accept when the first DATE batch matches registrationOpensAt', () => {
    // Arrange
    const batches: BatchValidationInput[] = [
      {
        name: '1º Lote',
        type: 'DATE',
        position: 1,
        price: 50,
        startDate: '2026-05-01T00:00:00.000Z',
        endDate: '2026-05-20T23:59:59.999Z',
      },
    ];

    // Act
    const result = validateBatchPlan(batches, category, event);

    // Assert
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // Deve permitir 1º lote QUANTITY sem exigir correspondência com registrationOpensAt
  it('should allow first batch to be QUANTITY without matching registrationOpensAt', () => {
    // Arrange
    const batches: BatchValidationInput[] = [
      {
        name: '1º Lote por Vagas',
        type: 'QUANTITY',
        position: 1,
        price: 50,
        maxQuantity: 100,
      },
    ];

    // Act
    const result = validateBatchPlan(batches, category, event);

    // Assert
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // Deve falhar quando endDate for anterior ou igual a startDate em lote DATE
  it('should fail when endDate is before or equal to startDate in a DATE batch', () => {
    // Arrange
    const batches: BatchValidationInput[] = [
      {
        name: 'Lote Invertido',
        type: 'DATE',
        position: 1,
        price: 50,
        startDate: '2026-05-10T00:00:00.000Z',
        endDate: '2026-05-05T00:00:00.000Z',
      },
    ];

    // Act
    const result = validateBatchPlan(batches, category, { ...event, registrationOpensAt: '2026-05-10T00:00:00.000Z' });

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('posterior à data de início'))).toBe(true);
  });

  // Deve falhar quando lote DATE tiver datas ausentes
  it('should fail when DATE batch is missing startDate or endDate', () => {
    // Arrange
    const batches: BatchValidationInput[] = [
      {
        name: 'Lote Sem Data',
        type: 'DATE',
        position: 1,
        price: 50,
      },
    ];

    // Act
    const result = validateBatchPlan(batches, category, event);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('obrigatórias'))).toBe(true);
  });

  // Deve falhar quando endDate for posterior à data do evento
  it('should fail when endDate of a DATE batch is after event date', () => {
    // Arrange
    const batches: BatchValidationInput[] = [
      {
        name: 'Lote Ultrapassando Prova',
        type: 'DATE',
        position: 1,
        price: 50,
        startDate: '2026-05-01T00:00:00.000Z',
        endDate: '2026-10-05T00:00:00.000Z', // evento é 2026-10-01
      },
    ];

    // Act
    const result = validateBatchPlan(batches, category, event);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('posterior à data do evento'))).toBe(true);
  });

  // Deve falhar quando houver sobreposição temporal entre lotes DATE
  it('should fail when there is time overlap between DATE batches', () => {
    // Arrange
    const batches: BatchValidationInput[] = [
      {
        name: '1º Lote',
        type: 'DATE',
        position: 1,
        price: 50,
        startDate: '2026-05-01T00:00:00.000Z',
        endDate: '2026-05-20T23:59:59.999Z',
      },
      {
        name: '2º Lote',
        type: 'DATE',
        position: 2,
        price: 70,
        startDate: '2026-05-15T00:00:00.000Z', // sobrepõe com lote 1
        endDate: '2026-06-01T23:59:59.999Z',
      },
    ];

    // Act
    const result = validateBatchPlan(batches, category, event);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('sobreposição'))).toBe(true);
  });

  // Deve falhar quando QUANTITY não tiver maxQuantity ou for <= 0
  it('should fail when QUANTITY batch has non-positive or missing maxQuantity', () => {
    // Arrange
    const batches: BatchValidationInput[] = [
      {
        name: 'Lote 0 Vagas',
        type: 'QUANTITY',
        position: 1,
        price: 50,
        maxQuantity: 0,
      },
    ];

    // Act
    const result = validateBatchPlan(batches, category, event);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('maior que zero'))).toBe(true);
  });

  // Deve falhar quando a soma de vagas dos lotes QUANTITY exceder totalSlots da categoria
  it('should fail when sum of maxQuantity exceeds category totalSlots', () => {
    // Arrange
    const batches: BatchValidationInput[] = [
      {
        name: 'Lote 1',
        type: 'QUANTITY',
        position: 1,
        price: 50,
        maxQuantity: 60,
      },
      {
        name: 'Lote 2',
        type: 'QUANTITY',
        position: 2,
        price: 70,
        maxQuantity: 50, // 60 + 50 = 110 > 100
      },
    ];

    // Act
    const result = validateBatchPlan(batches, category, event);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('excede o total de vagas'))).toBe(true);
  });

  // Deve aceitar quando a soma for exatamente igual ou inferior a totalSlots
  it('should accept when sum of maxQuantity is equal or less than category totalSlots', () => {
    // Arrange
    const batches: BatchValidationInput[] = [
      {
        name: 'Lote 1',
        type: 'QUANTITY',
        position: 1,
        price: 50,
        maxQuantity: 40,
      },
      {
        name: 'Lote 2',
        type: 'QUANTITY',
        position: 2,
        price: 70,
        maxQuantity: 60, // 40 + 60 = 100 === totalSlots
      },
    ];

    // Act
    const result = validateBatchPlan(batches, category, event);

    // Assert
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
