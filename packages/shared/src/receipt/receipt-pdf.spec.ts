import { describe, it, expect } from 'vitest';
import { renderReceiptPdf } from './receipt-pdf';
import { ReceiptData } from './receipt-model';

describe('renderReceiptPdf', () => {
  const baseReceiptData: ReceiptData = {
    receiptCode: 'REC-ABCD-EFGH',
    eventName: 'Maratona do Rio 2026',
    eventDate: '2026-10-25T07:00:00Z',
    eventLocation: 'Aterro do Flamengo, Rio de Janeiro - RJ',
    athleteName: 'Carlos Silva Mendes',
    athleteCpf: '12345678900',
    athleteBirthDate: '1992-04-12T00:00:00Z',
    athleteGender: 'MASCULINO',
    categoryName: '21K Meia Maratona',
    batchName: '1º Lote Oficial',
    shirtSize: 'G',
    amountPaid: 149.9,
    verificationUrl: 'https://syncflow.com/verificar/REC-ABCD-EFGH',
    issuedAt: '2026-10-20T15:00:00Z',
  };

  // Retorna um Buffer iniciado com os bytes mágicos do formato PDF (%PDF-)
  it('should generate a valid PDF buffer starting with %PDF-', async () => {
    // Arrange & Act
    const buffer = await renderReceiptPdf(baseReceiptData);

    // Assert
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(100);
    const header = buffer.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');
  });

  // Gera PDF com sucesso para evento gratuito (amountPaid = 0)
  it('should generate PDF correctly for free event with amount zero', async () => {
    // Arrange
    const freeEventData: ReceiptData = {
      ...baseReceiptData,
      amountPaid: 0,
      receiptCode: 'REC-FREE-1234',
      verificationUrl: 'https://syncflow.com/verificar/REC-FREE-1234',
    };

    // Act
    const buffer = await renderReceiptPdf(freeEventData);

    // Assert
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  // Gera PDF sem kit e sem data de nascimento legado (campos opcionais omitidos)
  it('should generate PDF without shirt size and without birth date when not provided', async () => {
    // Arrange
    const noKitData: ReceiptData = {
      ...baseReceiptData,
      shirtSize: null,
      athleteBirthDate: null,
      athleteGender: null,
      eventLocation: null,
      issuedAt: undefined,
    };

    // Act
    const buffer = await renderReceiptPdf(noKitData);

    // Assert
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  // Suporta nomes longos e caracteres especiais em UTF-8 sem lançar exceção
  it('should handle long names and accented characters safely', async () => {
    // Arrange
    const longNameData: ReceiptData = {
      ...baseReceiptData,
      eventName: 'Circuito Internacional de Corridas Rurais & Montanhismo da Serra da Mantiqueira 2026',
      athleteName: 'José Antônio da Conceição e Silva de Alencar de Albuquerque',
      categoryName: 'Ultramaratona de Montanha 100K - Categoria Master Especial',
    };

    // Act
    const buffer = await renderReceiptPdf(longNameData);

    // Assert
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  // Renderiza com logo customizado quando fornecido
  it('should render PDF with custom logoBuffer when provided', async () => {
    // Arrange: criar um PNG 1x1 simples em buffer
    const customLogo = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    const dataWithCustomLogo: ReceiptData = {
      ...baseReceiptData,
      logoBuffer: customLogo,
    };

    // Act
    const buffer = await renderReceiptPdf(dataWithCustomLogo);

    // Assert
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  // Renderiza sem logo quando logoBuffer é explicitamente null
  it('should render PDF without logo when logoBuffer is null', async () => {
    // Arrange
    const dataWithoutLogo: ReceiptData = {
      ...baseReceiptData,
      logoBuffer: null,
    };

    // Act
    const buffer = await renderReceiptPdf(dataWithoutLogo);

    // Assert
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  // Trata fallback gracioso se logoBuffer for corrompido/inválido
  it('should handle corrupted logo buffer gracefully without throwing', async () => {
    // Arrange
    const dataWithCorruptedLogo: ReceiptData = {
      ...baseReceiptData,
      logoBuffer: Buffer.from('corrupted_not_a_valid_image'),
    };

    // Act
    const buffer = await renderReceiptPdf(dataWithCorruptedLogo);

    // Assert
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
