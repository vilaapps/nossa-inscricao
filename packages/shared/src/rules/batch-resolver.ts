export interface BatchCandidate {
  id: string;
  categoryId?: string | null;
  eventId?: string | null;
  name: string;
  type: 'DATE' | 'QUANTITY';
  position: number;
  price: number;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  maxQuantity?: number | null;
  soldQuantity?: number | null;
  active?: boolean;
}

export interface BatchStatusResult {
  status: 'OPEN' | 'NOT_STARTED' | 'CLOSED';
  activeBatch: BatchCandidate | null;
  opensAt: Date | null;
}

/**
 * Avalia o status detalhado dos lotes de uma categoria em um dado momento.
 * Considera:
 * 1. A data global de abertura do evento (registrationOpensAt) se fornecida;
 * 2. Lotes candidatos ordenados por position;
 * 3. Identifica se o lote ativo ainda não abriu (NOT_STARTED) com sua data exata de início,
 *    se está aberto (OPEN), ou se todos já encerraram/esgotaram (CLOSED).
 */
export function getCategoryBatchStatus(
  batches: BatchCandidate[],
  eventRegistrationOpensAt?: Date | string | null,
  nowDate: Date | string = new Date(),
): BatchStatusResult {
  const nowMs = typeof nowDate === 'string' ? new Date(nowDate).getTime() : nowDate.getTime();

  if (eventRegistrationOpensAt) {
    const eventOpenMs =
      typeof eventRegistrationOpensAt === 'string'
        ? new Date(eventRegistrationOpensAt).getTime()
        : eventRegistrationOpensAt.getTime();
    if (nowMs < eventOpenMs) {
      return {
        status: 'NOT_STARTED',
        activeBatch: null,
        opensAt: new Date(eventOpenMs),
      };
    }
  }

  const sorted = batches
    .filter((b) => b.active !== false)
    .sort((a, b) => a.position - b.position);

  if (sorted.length === 0) {
    return {
      status: 'CLOSED',
      activeBatch: null,
      opensAt: null,
    };
  }

  for (const batch of sorted) {
    if (batch.type === 'DATE') {
      const startMs = batch.startDate ? new Date(batch.startDate).getTime() : 0;
      const endMs = batch.endDate ? new Date(batch.endDate).getTime() : Number.POSITIVE_INFINITY;

      if (nowMs > endMs) {
        continue;
      }

      if (nowMs < startMs) {
        return {
          status: 'NOT_STARTED',
          activeBatch: null,
          opensAt: new Date(startMs),
        };
      }

      return {
        status: 'OPEN',
        activeBatch: batch,
        opensAt: null,
      };
    }

    if (batch.type === 'QUANTITY') {
      const max = batch.maxQuantity ?? 0;
      const sold = batch.soldQuantity ?? 0;

      if (sold >= max) {
        continue;
      }

      return {
        status: 'OPEN',
        activeBatch: batch,
        opensAt: null,
      };
    }
  }

  return {
    status: 'CLOSED',
    activeBatch: null,
    opensAt: null,
  };
}

/**
 * Determina qual lote está ativo para uma categoria em um dado momento.
 * Os lotes são ordenados crescentemente por position.
 * Um lote fecha quando:
 * - Tipo DATE: now > endDate
 * - Tipo QUANTITY: soldQuantity >= maxQuantity
 *
 * Se o lote candidato (após o encerramento dos anteriores) for do tipo DATE e
 * a data atual for anterior a startDate (ou se o evento ainda não abriu), retorna null.
 */
export function resolveActiveBatch(
  batches: BatchCandidate[],
  nowDate: Date | string = new Date(),
  eventRegistrationOpensAt?: Date | string | null,
): BatchCandidate | null {
  const result = getCategoryBatchStatus(batches, eventRegistrationOpensAt, nowDate);
  return result.activeBatch;
}
