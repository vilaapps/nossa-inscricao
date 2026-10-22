export interface ReceiptData {
  receiptCode: string;
  eventName: string;
  eventDate: Date | string;
  eventLocation?: string | null;
  athleteName: string;
  athleteCpf: string;
  athleteBirthDate?: Date | string | null;
  athleteGender?: string | null;
  categoryName: string;
  batchName: string;
  shirtSize?: string | null;
  amountPaid: number;
  verificationUrl: string;
  issuedAt?: Date | string;
  logoBuffer?: Buffer | null;
}

/**
 * Mascara um CPF mantendo apenas os dígitos do meio visíveis: ***.456.789-**
 */
export function maskCpf(rawCpf: string): string {
  const digits = (rawCpf || '').replace(/\D/g, '');
  if (digits.length !== 11) {
    return '***.***.***-**';
  }
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

/**
 * Abrevia o sobrenome para proteger a privacidade em consultas públicas.
 * Exemplo: "Carlos Silva Mendes" -> "Carlos S. M."
 */
export function maskName(fullName: string): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0];
  const firstName = parts[0];
  const maskedSurnames = parts.slice(1).map((s) => `${s[0].toUpperCase()}.`);
  return `${firstName} ${maskedSurnames.join(' ')}`;
}

/**
 * Formata o valor pago no comprovante (ou 'GRATUITO').
 */
export function formatReceiptPrice(amount: number): string {
  if (amount === 0) return 'GRATUITO';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount);
}

/**
 * Formata data de nascimento para DD/MM/AAAA ou retorna null se ausente.
 */
export function formatReceiptBirthDate(dateVal?: Date | string | null): string | null {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return null;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
