export interface BatchValidationInput {
  id?: string;
  name: string;
  type: 'DATE' | 'QUANTITY';
  position: number;
  price: number;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  maxQuantity?: number | null;
}

export interface CategoryValidationInput {
  id?: string;
  name?: string;
  totalSlots: number;
}

export interface EventValidationInput {
  id?: string;
  registrationOpensAt?: Date | string | null;
  date: Date | string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Valida o plano de lotes de uma categoria em relação às vagas da categoria e datas do evento.
 * Garante:
 * 1. Ao menos um lote configurado.
 * 2. Posições sequenciais e sem duplicidade.
 * 3. 1º lote DATE deve ter início igual a registrationOpensAt do evento.
 * 4. Datas obrigatórias e consistentes (endDate > startDate e endDate <= eventDate).
 * 5. Sem sobreposição de período entre lotes DATE.
 * 6. Vagas em QUANTITY válidas e a soma não excede totalSlots da categoria.
 */
export function validateBatchPlan(
  batches: BatchValidationInput[],
  category: CategoryValidationInput,
  event: EventValidationInput,
): ValidationResult {
  const errors: string[] = [];

  if (!batches || batches.length === 0) {
    errors.push('A categoria deve ter ao menos um lote configurado.');
    return { valid: false, errors };
  }

  const positions = new Set<number>();
  for (const b of batches) {
    if (b.position < 1 || positions.has(b.position)) {
      errors.push('As posições dos lotes devem ser únicas e sequenciais (a partir de 1).');
      break;
    }
    positions.add(b.position);
  }

  const sorted = [...batches].sort((a, b) => a.position - b.position);

  const eventDateMs = new Date(event.date).getTime();
  const regOpensAtMs = event.registrationOpensAt ? new Date(event.registrationOpensAt).getTime() : null;

  const firstBatch = sorted[0];
  if (firstBatch.type === 'DATE' && regOpensAtMs !== null && firstBatch.startDate) {
    const firstStartMs = new Date(firstBatch.startDate).getTime();
    if (firstStartMs !== regOpensAtMs) {
      errors.push(
        `A data de início do primeiro lote (${firstBatch.name}) deve coincidir com a data de abertura das inscrições do evento.`,
      );
    }
  }

  let sumQuantity = 0;
  const dateBatches: { name: string; position: number; startMs: number; endMs: number }[] = [];

  for (const b of sorted) {
    if (b.type === 'DATE') {
      if (!b.startDate || !b.endDate) {
        errors.push(`As datas de início e término são obrigatórias para o lote por data "${b.name}".`);
        continue;
      }

      const startMs = new Date(b.startDate).getTime();
      const endMs = new Date(b.endDate).getTime();

      if (endMs <= startMs) {
        errors.push(`A data de término do lote "${b.name}" deve ser posterior à data de início.`);
      }

      if (endMs > eventDateMs) {
        errors.push(`A data de término do lote "${b.name}" não pode ser posterior à data do evento.`);
      }

      dateBatches.push({ name: b.name, position: b.position, startMs, endMs });
    } else if (b.type === 'QUANTITY') {
      if (b.maxQuantity === null || b.maxQuantity === undefined || b.maxQuantity <= 0) {
        errors.push(`A quantidade máxima de vagas do lote "${b.name}" deve ser um número maior que zero.`);
      } else {
        sumQuantity += b.maxQuantity;
      }
    }
  }

  for (let i = 0; i < dateBatches.length; i++) {
    for (let j = i + 1; j < dateBatches.length; j++) {
      const b1 = dateBatches[i];
      const b2 = dateBatches[j];
      if (Math.max(b1.startMs, b2.startMs) < Math.min(b1.endMs, b2.endMs)) {
        errors.push(`Existe sobreposição de períodos entre os lotes "${b1.name}" e "${b2.name}".`);
      }
    }
  }

  if (category.totalSlots > 0 && sumQuantity > category.totalSlots) {
    errors.push(
      `A soma das vagas dos lotes por quantidade (${sumQuantity}) excede o total de vagas da categoria (${category.totalSlots}).`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
