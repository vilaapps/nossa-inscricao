import type { ValidationResult } from './batch-validation';

export interface EventPayloadInput {
  name?: string;
  date?: Date | string | null;
  registrationOpensAt?: Date | string | null;
  hasKit?: boolean;
  kitSizes?: string[];
  adminFeeRate?: number | string | null;
}

export interface NormalizedEventPayload {
  name?: string;
  date?: Date | string | null;
  registrationOpensAt?: Date | string | null;
  hasKit: boolean;
  kitSizes: string[];
  adminFeeRate: number | null;
}

/**
 * Valida os dados de cadastro e edição de eventos em relação a:
 * - Kit e lista de tamanhos;
 * - Taxa administrativa (aceita 0 a 100, ou null para herdar do tenant);
 * - Consistência de datas (evento no futuro, abertura anterior ao evento).
 */
export function validateEventPayload(
  payload: EventPayloadInput,
  now: Date | string = new Date(),
): ValidationResult {
  const errors: string[] = [];

  if (payload.hasKit) {
    if (!payload.kitSizes || payload.kitSizes.length === 0) {
      errors.push('Eventos com kit devem definir ao menos um tamanho de camiseta/kit.');
    } else {
      const trimmed = payload.kitSizes.map((s) => s.trim());
      const hasEmpty = trimmed.some((s) => s.length === 0);
      const unique = new Set(trimmed);
      if (hasEmpty || unique.size !== trimmed.length) {
        errors.push('A lista de tamanhos de kit não pode conter itens duplicados ou vazios.');
      }
    }
  }

  if (payload.adminFeeRate !== null && payload.adminFeeRate !== undefined && String(payload.adminFeeRate).trim() !== '') {
    const rate = Number(payload.adminFeeRate);
    if (Number.isNaN(rate)) {
      errors.push('O valor da taxa administrativa deve ser um número válido.');
    } else if (rate < 0 || rate > 100) {
      errors.push('A taxa administrativa deve estar entre 0% e 100%.');
    }
  }

  const nowMs = typeof now === 'string' ? new Date(now).getTime() : now.getTime();

  if (payload.date) {
    const eventDateMs = new Date(payload.date).getTime();
    if (eventDateMs < nowMs) {
      errors.push('A data do evento não pode estar no passado.');
    }

    if (payload.registrationOpensAt) {
      const regOpensAtMs = new Date(payload.registrationOpensAt).getTime();
      if (regOpensAtMs >= eventDateMs) {
        errors.push('A data de abertura das inscrições deve ser anterior à data do evento.');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Normaliza os campos do evento garantindo descarte de kitSizes caso hasKit seja false,
 * remoção de duplicidades e conversão do adminFeeRate.
 */
export function normalizeEventPayload(payload: EventPayloadInput): NormalizedEventPayload {
  const hasKit = Boolean(payload.hasKit);

  let kitSizes: string[] = [];
  if (hasKit && payload.kitSizes) {
    const trimmed = payload.kitSizes.map((s) => s.trim()).filter((s) => s.length > 0);
    kitSizes = Array.from(new Set(trimmed));
  }

  let adminFeeRate: number | null = null;
  if (payload.adminFeeRate !== null && payload.adminFeeRate !== undefined && String(payload.adminFeeRate).trim() !== '') {
    const parsed = Number(payload.adminFeeRate);
    if (!Number.isNaN(parsed)) {
      adminFeeRate = parsed;
    }
  }

  return {
    ...payload,
    hasKit,
    kitSizes,
    adminFeeRate,
  };
}
