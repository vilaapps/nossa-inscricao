import { describe, it, expect } from 'vitest';
import { generateReceiptCode, isValidReceiptCode } from './receipt-code';

describe('generateReceiptCode', () => {
  // Deve gerar código com formato esperado (prefixo REC- e caracteres alfanuméricos)
  it('should generate receipt code with standard prefix and expected length', () => {
    // Arrange & Act
    const code = generateReceiptCode();

    // Assert
    expect(code).toMatch(/^REC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(code.length).toBe(13);
  });

  // Não deve conter caracteres visualmente ambíguos (0, O, 1, I)
  it('should not contain ambiguous characters 0, O, 1, I', () => {
    // Arrange & Act
    for (let i = 0; i < 100; i++) {
      const code = generateReceiptCode();

      // Assert
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  // Deve gerar 1000 códigos únicos sem colisão
  it('should generate 1000 unique codes without collision', () => {
    // Arrange
    const generated = new Set<string>();

    // Act
    for (let i = 0; i < 1000; i++) {
      generated.add(generateReceiptCode());
    }

    // Assert
    expect(generated.size).toBe(1000);
  });
});

describe('isValidReceiptCode', () => {
  // Deve retornar true para código válido gerado
  it('should return true for valid receipt code', () => {
    // Arrange
    const code = generateReceiptCode();

    // Act & Assert
    expect(isValidReceiptCode(code)).toBe(true);
  });

  // Deve retornar false para códigos nulos, vazios ou com formato incorreto
  it('should return false for invalid or malformed receipt codes', () => {
    // Arrange & Act & Assert
    expect(isValidReceiptCode('')).toBe(false);
    expect(isValidReceiptCode(null as any)).toBe(false);
    expect(isValidReceiptCode('REC-0000-1111')).toBe(false); // contém 0 e 1
    expect(isValidReceiptCode('INVALIDO')).toBe(false);
    expect(isValidReceiptCode('REC-ABCD')).toBe(false);
  });
});
