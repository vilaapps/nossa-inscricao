import { describe, it, expect } from 'vitest';
import { resolveActiveBatch, getCategoryBatchStatus, BatchCandidate } from './batch-resolver';

describe('resolveActiveBatch', () => {
  // Deve retornar null quando a lista de lotes for vazia
  it('should return null when batches array is empty', () => {
    // Arrange
    const batches: BatchCandidate[] = [];

    // Act
    const active = resolveActiveBatch(batches, new Date('2026-05-01T10:00:00Z'));

    // Assert
    expect(active).toBeNull();
  });

  // Deve ignorar lotes inativos com active=false
  it('should ignore inactive batches where active is false', () => {
    // Arrange
    const batches: BatchCandidate[] = [
      {
        id: 'b1',
        name: 'Lote Desativado',
        type: 'QUANTITY',
        position: 1,
        price: 50,
        maxQuantity: 100,
        soldQuantity: 10,
        active: false,
      },
    ];

    // Act
    const active = resolveActiveBatch(batches);

    // Assert
    expect(active).toBeNull();
  });

  // Deve ordenar lotes por position antes de resolver
  it('should sort batches by position ascending', () => {
    // Arrange
    const batches: BatchCandidate[] = [
      {
        id: 'b2',
        name: '2º Lote',
        type: 'QUANTITY',
        position: 2,
        price: 80,
        maxQuantity: 100,
        soldQuantity: 0,
      },
      {
        id: 'b1',
        name: '1º Lote',
        type: 'QUANTITY',
        position: 1,
        price: 50,
        maxQuantity: 100,
        soldQuantity: 0,
      },
    ];

    // Act
    const active = resolveActiveBatch(batches);

    // Assert
    expect(active?.id).toBe('b1');
  });

  // Deve ativar lote DATE dentro da janela de início e término
  it('should activate DATE batch when current time is strictly inside start and end dates', () => {
    // Arrange
    const batches: BatchCandidate[] = [
      {
        id: 'b1',
        name: '1º Lote',
        type: 'DATE',
        position: 1,
        price: 60,
        startDate: '2026-05-01T00:00:00.000Z',
        endDate: '2026-05-15T23:59:59.999Z',
      },
    ];

    // Act
    const active = resolveActiveBatch(batches, '2026-05-10T12:00:00.000Z');

    // Assert
    expect(active?.id).toBe('b1');
  });

  // Deve ativar lote DATE exatamente no marco de startDate e de endDate
  it('should activate DATE batch exactly at startDate and exactly at endDate boundaries', () => {
    // Arrange
    const batch: BatchCandidate = {
      id: 'b1',
      name: '1º Lote',
      type: 'DATE',
      position: 1,
      price: 60,
      startDate: '2026-05-01T00:00:00.000Z',
      endDate: '2026-05-15T23:59:59.999Z',
    };

    // Act & Assert (exatamente em startDate)
    expect(resolveActiveBatch([batch], '2026-05-01T00:00:00.000Z')?.id).toBe('b1');

    // Act & Assert (exatamente em endDate)
    expect(resolveActiveBatch([batch], '2026-05-15T23:59:59.999Z')?.id).toBe('b1');
  });

  // Deve retornar null quando o momento atual for 1ms antes do startDate do primeiro lote
  it('should return null when time is 1ms before startDate of DATE batch', () => {
    // Arrange
    const batch: BatchCandidate = {
      id: 'b1',
      name: '1º Lote',
      type: 'DATE',
      position: 1,
      price: 60,
      startDate: '2026-05-01T00:00:00.000Z',
      endDate: '2026-05-15T23:59:59.999Z',
    };

    // Act
    const active = resolveActiveBatch([batch], '2026-04-30T23:59:59.999Z');

    // Assert
    expect(active).toBeNull();
  });

  // Deve fechar lote DATE quando momento atual for 1ms após endDate
  it('should close DATE batch when time is 1ms after endDate', () => {
    // Arrange
    const batch: BatchCandidate = {
      id: 'b1',
      name: '1º Lote',
      type: 'DATE',
      position: 1,
      price: 60,
      startDate: '2026-05-01T00:00:00.000Z',
      endDate: '2026-05-15T23:59:59.999Z',
    };

    // Act
    const active = resolveActiveBatch([batch], '2026-05-16T00:00:00.000Z');

    // Assert
    expect(active).toBeNull();
  });

  // Deve ativar lote QUANTITY enquanto sold < max e quando sold = max - 1
  it('should activate QUANTITY batch when soldQuantity is below maxQuantity and at max - 1', () => {
    // Arrange
    const batch: BatchCandidate = {
      id: 'b1',
      name: '1º Lote',
      type: 'QUANTITY',
      position: 1,
      price: 50,
      maxQuantity: 100,
      soldQuantity: 99,
    };

    // Act
    const active = resolveActiveBatch([batch]);

    // Assert
    expect(active?.id).toBe('b1');
  });

  // Deve virar lote QUANTITY para o próximo quando sold atingir maxQuantity
  it('should turn over to next batch when soldQuantity reaches maxQuantity', () => {
    // Arrange
    const batches: BatchCandidate[] = [
      {
        id: 'b1',
        name: '1º Lote',
        type: 'QUANTITY',
        position: 1,
        price: 50,
        maxQuantity: 50,
        soldQuantity: 50,
      },
      {
        id: 'b2',
        name: '2º Lote',
        type: 'QUANTITY',
        position: 2,
        price: 70,
        maxQuantity: 50,
        soldQuantity: 0,
      },
    ];

    // Act
    const active = resolveActiveBatch(batches);

    // Assert
    expect(active?.id).toBe('b2');
  });

  // Deve respeitar a transição mista de DATE -> QUANTITY -> DATE
  it('should handle mixed batch transitions: DATE -> QUANTITY -> DATE correctly', () => {
    // Arrange
    const now = '2026-06-01T12:00:00.000Z';
    const batches: BatchCandidate[] = [
      // 1º lote DATE encerrado em 2026-05-15
      {
        id: 'b1',
        name: 'Lote Promocional',
        type: 'DATE',
        position: 1,
        price: 50,
        startDate: '2026-05-01T00:00:00.000Z',
        endDate: '2026-05-15T23:59:59.999Z',
      },
      // 2º lote QUANTITY aberto com 20/50 vendidas
      {
        id: 'b2',
        name: 'Lote Especial Vagas',
        type: 'QUANTITY',
        position: 2,
        price: 75,
        maxQuantity: 50,
        soldQuantity: 20,
      },
      // 3º lote DATE futuro
      {
        id: 'b3',
        name: 'Lote Final',
        type: 'DATE',
        position: 3,
        price: 100,
        startDate: '2026-06-15T00:00:00.000Z',
        endDate: '2026-07-01T00:00:00.000Z',
      },
    ];

    // Act
    const active = resolveActiveBatch(batches, now);

    // Assert
    expect(active?.id).toBe('b2');
  });

  // Não deve pular um lote DATE anterior ainda aberto mesmo se houver QUANTITY posterior
  it('should not skip an earlier open DATE batch in favor of a subsequent batch', () => {
    // Arrange
    const now = '2026-05-10T12:00:00.000Z';
    const batches: BatchCandidate[] = [
      {
        id: 'b1',
        name: 'Lote 1 (Data)',
        type: 'DATE',
        position: 1,
        price: 60,
        startDate: '2026-05-01T00:00:00.000Z',
        endDate: '2026-05-20T23:59:59.999Z',
      },
      {
        id: 'b2',
        name: 'Lote 2 (Quantidade)',
        type: 'QUANTITY',
        position: 2,
        price: 80,
        maxQuantity: 100,
        soldQuantity: 0,
      },
    ];

    // Act
    const active = resolveActiveBatch(batches, now);

    // Assert
    expect(active?.id).toBe('b1');
  });

  // Não deve ativar o próximo lote se o lote atual por data ainda não abriu
  it('should return null when the candidate batch has not yet opened (now < startDate)', () => {
    // Arrange
    const now = '2026-05-20T00:00:00.000Z';
    const batches: BatchCandidate[] = [
      {
        id: 'b1',
        name: '1º Lote',
        type: 'DATE',
        position: 1,
        price: 50,
        startDate: '2026-05-01T00:00:00.000Z',
        endDate: '2026-05-15T23:59:59.999Z', // Fechou em 15/05
      },
      {
        id: 'b2',
        name: '2º Lote',
        type: 'DATE',
        position: 2,
        price: 70,
        startDate: '2026-06-01T00:00:00.000Z', // Abre apenas em 01/06
        endDate: '2026-06-15T23:59:59.999Z',
      },
    ];

    // Act
    const active = resolveActiveBatch(batches, now);

    // Assert
    expect(active).toBeNull();
  });

  // Deve ativar lote DATE sem startDate e sem endDate (sem restrição de janela)
  it('should activate DATE batch when startDate or endDate are omitted', () => {
    // Arrange
    const batchNoStart: BatchCandidate = {
      id: 'b1',
      name: 'Sem início',
      type: 'DATE',
      position: 1,
      price: 50,
      endDate: '2026-12-31T23:59:59.999Z',
    };
    const batchNoEnd: BatchCandidate = {
      id: 'b2',
      name: 'Sem término',
      type: 'DATE',
      position: 1,
      price: 50,
      startDate: '2026-01-01T00:00:00.000Z',
    };

    // Act & Assert
    expect(resolveActiveBatch([batchNoStart], new Date('2026-06-01T00:00:00.000Z'))?.id).toBe('b1');
    expect(resolveActiveBatch([batchNoEnd], new Date('2026-06-01T00:00:00.000Z'))?.id).toBe('b2');
  });

  // Deve tratar maxQuantity e soldQuantity ausentes como 0
  it('should treat missing maxQuantity or soldQuantity as 0', () => {
    // Arrange: maxQuantity ausente (= 0), soldQuantity ausente (= 0) -> sold (0) >= max (0) -> fecha
    const batchZero: BatchCandidate = {
      id: 'b1',
      name: 'Lote Vazio',
      type: 'QUANTITY',
      position: 1,
      price: 50,
    };

    // Act
    const active = resolveActiveBatch([batchZero]);

    // Assert
    expect(active).toBeNull();
  });

  // Deve utilizar a data atual quando nowDate for omitido
  it('should use current date when nowDate is omitted', () => {
    // Arrange
    const batch: BatchCandidate = {
      id: 'b1',
      name: 'Lote Vigente',
      type: 'DATE',
      position: 1,
      price: 50,
      startDate: new Date(Date.now() - 10000),
      endDate: new Date(Date.now() + 10000),
    };

    // Act
    const active = resolveActiveBatch([batch]);

    // Assert
    expect(active?.id).toBe('b1');
  });

  it('should return null when eventRegistrationOpensAt is in the future', () => {
    const batch: BatchCandidate = {
      id: 'b1',
      name: 'Lote 1',
      type: 'DATE',
      position: 1,
      price: 50,
      startDate: '2026-06-01T00:00:00Z',
      endDate: '2026-06-30T00:00:00Z',
    };

    const active = resolveActiveBatch(
      [batch],
      '2026-06-15T00:00:00Z',
      '2026-06-20T00:00:00Z',
    );
    expect(active).toBeNull();
  });
});

describe('getCategoryBatchStatus', () => {
  it('returns NOT_STARTED when eventRegistrationOpensAt is in future', () => {
    const batches: BatchCandidate[] = [
      {
        id: 'b1',
        name: 'Lote 1',
        type: 'QUANTITY',
        position: 1,
        price: 50,
        maxQuantity: 100,
        soldQuantity: 0,
      },
    ];

    const result = getCategoryBatchStatus(
      batches,
      '2026-07-01T10:00:00Z',
      '2026-06-01T10:00:00Z',
    );

    expect(result.status).toBe('NOT_STARTED');
    expect(result.activeBatch).toBeNull();
    expect(result.opensAt).toEqual(new Date('2026-07-01T10:00:00Z'));
  });

  it('handles eventRegistrationOpensAt as Date object', () => {
    const batches: BatchCandidate[] = [
      {
        id: 'b1',
        name: 'Lote 1',
        type: 'QUANTITY',
        position: 1,
        price: 50,
      },
    ];

    const result = getCategoryBatchStatus(
      batches,
      new Date('2026-07-01T10:00:00Z'),
      new Date('2026-06-01T10:00:00Z'),
    );

    expect(result.status).toBe('NOT_STARTED');
    expect(result.opensAt).toEqual(new Date('2026-07-01T10:00:00Z'));
  });

  it('returns NOT_STARTED when date batch startDate is in future', () => {
    const batches: BatchCandidate[] = [
      {
        id: 'b1',
        name: 'Lote 1',
        type: 'DATE',
        position: 1,
        price: 50,
        startDate: '2026-08-01T00:00:00Z',
        endDate: '2026-08-31T00:00:00Z',
      },
    ];

    const result = getCategoryBatchStatus(
      batches,
      null,
      '2026-07-15T00:00:00Z',
    );

    expect(result.status).toBe('NOT_STARTED');
    expect(result.activeBatch).toBeNull();
    expect(result.opensAt).toEqual(new Date('2026-08-01T00:00:00Z'));
  });

  it('returns OPEN when a batch is active', () => {
    const batches: BatchCandidate[] = [
      {
        id: 'b1',
        name: 'Lote 1',
        type: 'DATE',
        position: 1,
        price: 50,
        startDate: '2026-08-01T00:00:00Z',
        endDate: '2026-08-31T00:00:00Z',
      },
    ];

    const result = getCategoryBatchStatus(
      batches,
      null,
      '2026-08-15T00:00:00Z',
    );

    expect(result.status).toBe('OPEN');
    expect(result.activeBatch?.id).toBe('b1');
    expect(result.opensAt).toBeNull();
  });

  it('returns CLOSED when all batches are expired or sold out', () => {
    const batches: BatchCandidate[] = [
      {
        id: 'b1',
        name: 'Lote 1',
        type: 'DATE',
        position: 1,
        price: 50,
        startDate: '2026-08-01T00:00:00Z',
        endDate: '2026-08-10T00:00:00Z',
      },
    ];

    const result = getCategoryBatchStatus(
      batches,
      null,
      '2026-08-15T00:00:00Z',
    );

    expect(result.status).toBe('CLOSED');
    expect(result.activeBatch).toBeNull();
  });

  it('returns CLOSED when batches array is empty', () => {
    const result = getCategoryBatchStatus([], null, '2026-08-15T00:00:00Z');
    expect(result.status).toBe('CLOSED');
    expect(result.activeBatch).toBeNull();
  });
});

