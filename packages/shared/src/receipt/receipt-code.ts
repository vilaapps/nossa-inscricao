const UNAMBIGUOUS_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Gera um código de verificação para comprovante de inscrição no formato REC-XXXX-XXXX.
 * Utiliza apenas caracteres alfanuméricos sem ambiguidade visual (excluindo 0, O, 1, I).
 */
export function generateReceiptCode(): string {
  let part1 = '';
  let part2 = '';

  for (let i = 0; i < 4; i++) {
    part1 += UNAMBIGUOUS_CHARS.charAt(
      Math.floor(Math.random() * UNAMBIGUOUS_CHARS.length),
    );
    part2 += UNAMBIGUOUS_CHARS.charAt(
      Math.floor(Math.random() * UNAMBIGUOUS_CHARS.length),
    );
  }

  return `REC-${part1}-${part2}`;
}

/**
 * Valida se um código possui a estrutura e caracteres válidos de um comprovante.
 */
export function isValidReceiptCode(code: string): boolean {
  if (!code || typeof code !== 'string') {
    return false;
  }

  return /^REC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code.trim().toUpperCase());
}
