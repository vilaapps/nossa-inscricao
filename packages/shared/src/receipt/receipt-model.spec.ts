import { describe, it, expect } from 'vitest';
import {
  maskCpf,
  maskName,
  formatReceiptPrice,
  formatReceiptBirthDate,
} from './receipt-model';

describe('Receipt Model Utilities', () => {
  describe('maskCpf', () => {
    // Mascara CPF mantendo o miolo visível (***.456.789-**)
    it('should mask CPF keeping middle digits visible for formatted CPF', () => {
      // Arrange & Act
      const result = maskCpf('123.456.789-00');

      // Assert
      expect(result).toBe('***.456.789-**');
    });

    // Mascara CPF a partir de string com apenas números
    it('should mask CPF from raw digits', () => {
      // Arrange & Act
      const result = maskCpf('12345678900');

      // Assert
      expect(result).toBe('***.456.789-**');
    });

    // Trata CPF inválido ou vazio com fallback seguro
    it('should handle empty or malformed CPF gracefully', () => {
      // Arrange & Act & Assert
      expect(maskCpf('')).toBe('***.***.***-**');
      expect(maskCpf('123')).toBe('***.***.***-**');
    });
  });

  describe('maskName', () => {
    // Abrevia sobrenome para exibição pública de privacidade
    it('should mask surname for public display', () => {
      // Arrange & Act
      const result = maskName('Carlos Silva Mendes');

      // Assert
      expect(result).toBe('Carlos S. M.');
    });

    // Mantém nome único
    it('should keep single name unchanged', () => {
      // Arrange & Act
      const result = maskName('Carlos');

      // Assert
      expect(result).toBe('Carlos');
    });

    // Trata string vazia
    it('should handle empty string safely', () => {
      // Arrange & Act & Assert
      expect(maskName('')).toBe('');
    });
  });

  describe('formatReceiptPrice', () => {
    // Retorna GRATUITO para valor zero
    it('should return GRATUITO when amount is zero', () => {
      // Arrange & Act
      const result = formatReceiptPrice(0);

      // Assert
      expect(result).toBe('GRATUITO');
    });

    // Formata valor monetário em reais
    it('should format positive price in BRL format', () => {
      // Arrange & Act
      const result = formatReceiptPrice(99.9);

      // Assert
      expect(result).toContain('99,90');
    });
  });

  describe('formatReceiptBirthDate', () => {
    // Formata data de nascimento válida em DD/MM/AAAA
    it('should format valid birth date to DD/MM/YYYY', () => {
      // Arrange & Act
      const result = formatReceiptBirthDate('1990-05-15T00:00:00.000Z');

      // Assert
      expect(result).toBe('15/05/1990');
    });

    // Retorna null quando data não for informada ou for inválida
    it('should return null when date is null, undefined, or invalid', () => {
      // Arrange & Act & Assert
      expect(formatReceiptBirthDate(null)).toBeNull();
      expect(formatReceiptBirthDate(undefined)).toBeNull();
      expect(formatReceiptBirthDate('')).toBeNull();
      expect(formatReceiptBirthDate('data-invalida')).toBeNull();
    });
  });
});
