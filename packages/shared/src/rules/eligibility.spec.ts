import { describe, it, expect } from 'vitest';
import { ageOnDate, checkCategoryEligibility, CategoryEligibilityInput, AthleteEligibilityInput } from './eligibility';

describe('ageOnDate', () => {
  // Deve calcular idade exata quando a data de referência é o dia do aniversário
  it('should calculate exact age when reference date is birthday anniversary', () => {
    // Arrange
    const birthDate = '2008-05-15';
    const eventDate = '2026-05-15';

    // Act
    const age = ageOnDate(birthDate, eventDate);

    // Assert
    expect(age).toBe(18);
  });

  // Deve calcular idade com 1 ano a menos na véspera do aniversário
  it('should calculate age as 17 on the eve of the 18th birthday', () => {
    // Arrange
    const birthDate = '2008-05-15';
    const eventDate = '2026-05-14';

    // Act
    const age = ageOnDate(birthDate, eventDate);

    // Assert
    expect(age).toBe(17);
  });

  // Deve calcular idade 1 dia após o aniversário
  it('should calculate age correctly one day after birthday', () => {
    // Arrange
    const birthDate = '2008-05-15';
    const eventDate = '2026-05-16';

    // Act
    const age = ageOnDate(birthDate, eventDate);

    // Assert
    expect(age).toBe(18);
  });

  // Deve tratar nascidos em 29/02 em anos não bissextos
  it('should handle leap year birthday (Feb 29) on non-leap years', () => {
    // Arrange: nascido em 29/02/2004
    const birthDate = '2004-02-29';

    // Act & Assert
    // Em 28/02/2025 ainda tem 20 anos
    expect(ageOnDate(birthDate, '2025-02-28')).toBe(20);
    // Em 01/03/2025 já completou 21 anos
    expect(ageOnDate(birthDate, '2025-03-01')).toBe(21);
    // Em 29/02/2028 (ano bissexto) completa 24 anos
    expect(ageOnDate(birthDate, '2028-02-29')).toBe(24);
  });

  // Deve aceitar objetos Date nativos como parâmetros em ageOnDate
  it('should accept native Date objects in ageOnDate', () => {
    // Arrange
    const birth = new Date('2000-01-01T00:00:00Z');
    const ref = new Date('2026-01-01T00:00:00Z');

    // Act
    const age = ageOnDate(birth, ref);

    // Assert
    expect(age).toBe(26);
  });

  // Deve retornar NaN quando a data de nascimento for inválida
  it('should return NaN when birth date is invalid', () => {
    // Arrange & Act
    const age = ageOnDate('data-invalida', '2026-05-15');

    // Assert
    expect(Number.isNaN(age)).toBe(true);
  });
});

describe('checkCategoryEligibility', () => {
  const eventDate = '2026-06-20';

  // Deve retornar erro INVALID_BIRTH_DATE quando a data de nascimento for inválida
  it('should reject with INVALID_BIRTH_DATE when birth date string is malformed', () => {
    // Arrange
    const category: CategoryEligibilityInput = { minAge: 18 };
    const athlete: AthleteEligibilityInput = { birthDate: 'not-a-date', gender: 'MASCULINO' };

    // Act
    const result = checkCategoryEligibility(category, athlete, eventDate);

    // Assert
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('INVALID_BIRTH_DATE');
  });

  // Deve rejeitar quando a data de nascimento for no futuro em relação ao evento
  it('should reject with INVALID_BIRTH_DATE when birth date is after event date', () => {
    // Arrange
    const category: CategoryEligibilityInput = { minAge: 18 };
    const athlete: AthleteEligibilityInput = { birthDate: '2026-07-01', gender: 'MASCULINO' };

    // Act
    const result = checkCategoryEligibility(category, athlete, eventDate);

    // Assert
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('INVALID_BIRTH_DATE');
  });

  // Deve aprovar atleta quando a categoria não possui restrições de idade e gênero
  it('should approve athlete when category has no age or gender constraints', () => {
    // Arrange
    const category: CategoryEligibilityInput = {};
    const athlete: AthleteEligibilityInput = { birthDate: '1995-10-10', gender: 'FEMININO' };

    // Act
    const result = checkCategoryEligibility(category, athlete, eventDate);

    // Assert
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  // Deve aprovar atleta que faz 18 anos exatamente na data da prova para minAge=18
  it('should approve athlete reaching exact minAge on the day of the event', () => {
    // Arrange
    const category: CategoryEligibilityInput = { minAge: 18 };
    const athlete: AthleteEligibilityInput = { birthDate: '2008-06-20', gender: 'MASCULINO' };

    // Act
    const result = checkCategoryEligibility(category, athlete, eventDate);

    // Assert
    expect(result.eligible).toBe(true);
  });

  // Deve rejeitar com AGE_BELOW_MIN quando atleta tiver idade inferior à mínima
  it('should reject with AGE_BELOW_MIN when athlete age is below minAge', () => {
    // Arrange
    const category: CategoryEligibilityInput = { minAge: 18, name: 'Geral 10km' };
    const athlete: AthleteEligibilityInput = { birthDate: '2008-06-21', gender: 'MASCULINO' }; // 17 anos

    // Act
    const result = checkCategoryEligibility(category, athlete, eventDate);

    // Assert
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('AGE_BELOW_MIN');
    expect(result.details?.age).toBe(17);
    expect(result.details?.minAge).toBe(18);
    expect(result.message).toContain('Idade mínima de 18 anos');
  });

  // Deve rejeitar com AGE_ABOVE_MAX quando atleta tiver idade superior à máxima
  it('should reject with AGE_ABOVE_MAX when athlete age is above maxAge', () => {
    // Arrange
    const category: CategoryEligibilityInput = { maxAge: 35, name: 'Sub 35' };
    const athlete: AthleteEligibilityInput = { birthDate: '1990-01-01', gender: 'FEMININO' }; // 36 anos

    // Act
    const result = checkCategoryEligibility(category, athlete, eventDate);

    // Assert
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('AGE_ABOVE_MAX');
    expect(result.details?.age).toBe(36);
    expect(result.details?.maxAge).toBe(35);
    expect(result.message).toContain('Idade máxima de 35 anos');
  });

  // Deve aprovar atleta quando a idade estiver dentro da faixa [minAge, maxAge]
  it('should approve athlete when age is inside [minAge, maxAge] range', () => {
    // Arrange
    const category: CategoryEligibilityInput = { minAge: 20, maxAge: 29 };
    const athlete: AthleteEligibilityInput = { birthDate: '2000-01-01', gender: 'MASCULINO' }; // 26 anos

    // Act
    const result = checkCategoryEligibility(category, athlete, eventDate);

    // Assert
    expect(result.eligible).toBe(true);
  });

  // Deve aceitar qualquer gênero quando a categoria for MISTO ou não especificada
  it('should accept both male and female athletes when category gender is MISTO or null', () => {
    // Arrange
    const categoryMisto: CategoryEligibilityInput = { gender: 'MISTO' };
    const categoryNull: CategoryEligibilityInput = { gender: null };
    const categoryEmpty: CategoryEligibilityInput = { gender: '' };

    // Act & Assert
    expect(checkCategoryEligibility(categoryMisto, { birthDate: '1995-01-01', gender: 'MASCULINO' }, eventDate).eligible).toBe(true);
    expect(checkCategoryEligibility(categoryMisto, { birthDate: '1995-01-01', gender: 'FEMININO' }, eventDate).eligible).toBe(true);
    expect(checkCategoryEligibility(categoryNull, { birthDate: '1995-01-01', gender: 'FEMININO' }, eventDate).eligible).toBe(true);
    expect(checkCategoryEligibility(categoryEmpty, { birthDate: '1995-01-01', gender: 'FEMININO' }, eventDate).eligible).toBe(true);
  });

  // Deve rejeitar quando atleta não informar gênero e a categoria exigir gênero específico
  it('should reject when athlete has no gender and category requires specific gender', () => {
    // Arrange
    const category: CategoryEligibilityInput = { gender: 'MASCULINO' };
    const athlete: AthleteEligibilityInput = { birthDate: '1995-01-01', gender: null as any };

    // Act
    const result = checkCategoryEligibility(category, athlete, eventDate);

    // Assert
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('GENDER_MISMATCH');
  });

  // Deve rejeitar com GENDER_MISMATCH quando atleta feminino tentar categoria MASCULINO
  it('should reject with GENDER_MISMATCH when female athlete registers for male category', () => {
    // Arrange
    const category: CategoryEligibilityInput = { gender: 'MASCULINO' };
    const athlete: AthleteEligibilityInput = { birthDate: '1995-01-01', gender: 'FEMININO' };

    // Act
    const result = checkCategoryEligibility(category, athlete, eventDate);

    // Assert
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('GENDER_MISMATCH');
    expect(result.details?.requiredGender).toBe('MASCULINO');
    expect(result.details?.athleteGender).toBe('FEMININO');
    expect(result.message).toContain('masculino');
  });

  // Deve rejeitar com GENDER_MISMATCH quando atleta masculino tentar categoria FEMININO
  it('should reject with GENDER_MISMATCH when male athlete registers for female category', () => {
    // Arrange
    const category: CategoryEligibilityInput = { gender: 'FEMININO' };
    const athlete: AthleteEligibilityInput = { birthDate: '1995-01-01', gender: 'MASCULINO' };

    // Act
    const result = checkCategoryEligibility(category, athlete, eventDate);

    // Assert
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('GENDER_MISMATCH');
    expect(result.details?.requiredGender).toBe('FEMININO');
    expect(result.details?.athleteGender).toBe('MASCULINO');
    expect(result.message).toContain('feminino');
  });
});
