export interface CategoryEligibilityInput {
  id?: string;
  name?: string;
  minAge?: number | null;
  maxAge?: number | null;
  gender?: string | null;
}

export interface AthleteEligibilityInput {
  birthDate: Date | string;
  gender: string;
}

export type IneligibilityReason =
  | 'INVALID_BIRTH_DATE'
  | 'AGE_BELOW_MIN'
  | 'AGE_ABOVE_MAX'
  | 'GENDER_MISMATCH';

export interface EligibilityResult {
  eligible: boolean;
  reason?: IneligibilityReason;
  message?: string;
  details?: {
    age?: number;
    minAge?: number;
    maxAge?: number;
    requiredGender?: string;
    athleteGender?: string;
  };
}

/**
 * Calcula a idade completa em anos do atleta na data de referência (ex: data do evento).
 * Considera ano bissexto e aniversários no próprio dia da referência.
 */
export function ageOnDate(birthDate: Date | string, referenceDate: Date | string): number {
  const birth = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  const ref = typeof referenceDate === 'string' ? new Date(referenceDate) : referenceDate;

  if (Number.isNaN(birth.getTime()) || Number.isNaN(ref.getTime())) {
    return Number.NaN;
  }

  const birthYear = birth.getUTCFullYear();
  const birthMonth = birth.getUTCMonth();
  const birthDay = birth.getUTCDate();

  const refYear = ref.getUTCFullYear();
  const refMonth = ref.getUTCMonth();
  const refDay = ref.getUTCDate();

  let age = refYear - birthYear;

  if (refMonth < birthMonth || (refMonth === birthMonth && refDay < birthDay)) {
    age -= 1;
  }

  return age;
}

/**
 * Valida se um atleta é elegível para uma determinada categoria na data do evento.
 */
export function checkCategoryEligibility(
  category: CategoryEligibilityInput,
  athlete: AthleteEligibilityInput,
  eventDate: Date | string,
): EligibilityResult {
  const age = ageOnDate(athlete.birthDate, eventDate);

  if (Number.isNaN(age) || age < 0) {
    return {
      eligible: false,
      reason: 'INVALID_BIRTH_DATE',
      message: 'Data de nascimento inválida ou posterior à data do evento.',
    };
  }

  if (category.minAge !== null && category.minAge !== undefined) {
    if (age < category.minAge) {
      return {
        eligible: false,
        reason: 'AGE_BELOW_MIN',
        message: `Idade mínima de ${category.minAge} anos exigida na data da prova (você terá ${age} anos).`,
        details: {
          age,
          minAge: category.minAge,
        },
      };
    }
  }

  if (category.maxAge !== null && category.maxAge !== undefined) {
    if (age > category.maxAge) {
      return {
        eligible: false,
        reason: 'AGE_ABOVE_MAX',
        message: `Idade máxima de ${category.maxAge} anos permitida na data da prova (você terá ${age} anos).`,
        details: {
          age,
          maxAge: category.maxAge,
        },
      };
    }
  }

  const catGender = (category.gender ?? 'MISTO').toUpperCase().trim();
  const athGender = (athlete.gender ?? '').toUpperCase().trim();

  if (catGender !== 'MISTO' && catGender !== '' && catGender !== athGender) {
    const isMale = catGender === 'MASCULINO';
    return {
      eligible: false,
      reason: 'GENDER_MISMATCH',
      message: `Categoria exclusiva para o gênero ${isMale ? 'masculino' : 'feminino'}.`,
      details: {
        requiredGender: catGender,
        athleteGender: athGender,
      },
    };
  }

  return { eligible: true };
}
