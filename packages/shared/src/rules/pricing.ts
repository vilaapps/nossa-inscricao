export interface CouponInput {
  code?: string;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
}

export interface CalcOrderParams {
  basePrice: number;
  coupon?: CouponInput | null;
  feeRate?: number | null;
}

export interface OrderCalculation {
  basePrice: number;
  discount: number;
  subtotal: number;
  adminFee: number;
  total: number;
  feeRate: number;
  isFree: boolean;
}

/**
 * Retorna a taxa percentual efetiva a ser aplicada no pedido.
 * O override de adminFeeRate do evento tem precedência absoluta, inclusive se for 0.
 * Nunca utiliza o operador `||` para não ignorar o valor 0.
 */
export function effectiveFeeRate(
  event?: { adminFeeRate?: number | string | unknown } | null,
  tenant?: { commissionRate?: number | string | unknown } | null,
): number {
  if (event?.adminFeeRate !== null && event?.adminFeeRate !== undefined) {
    const parsed = Number(event.adminFeeRate);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  if (tenant?.commissionRate !== null && tenant?.commissionRate !== undefined) {
    const parsed = Number(tenant.commissionRate);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return 0;
}

/**
 * Arredonda um número para 2 casas decimais sem erro de precisão binária.
 */
function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula os valores financeiros do pedido.
 * Se subtotal === 0 (evento grátis ou cupom 100%), a taxa administrativa é zerada e isFree é verdadeiro.
 */
export function calcOrder(params: CalcOrderParams): OrderCalculation {
  const basePrice = Math.max(0, roundToTwo(params.basePrice));
  const rawFeeRate = params.feeRate ?? 0;
  const normalizedFeeRate = rawFeeRate > 0 ? rawFeeRate : 0;

  let discount = 0;
  if (params.coupon && basePrice > 0) {
    if (params.coupon.discountType === 'PERCENTAGE') {
      const pct = Math.max(0, Math.min(100, params.coupon.discountValue));
      discount = roundToTwo((basePrice * pct) / 100);
    } else if (params.coupon.discountType === 'FIXED') {
      discount = roundToTwo(Math.max(0, params.coupon.discountValue));
    }
  }

  if (discount > basePrice) {
    discount = basePrice;
  }

  const subtotal = roundToTwo(basePrice - discount);

  let adminFee = 0;
  if (subtotal > 0 && normalizedFeeRate > 0) {
    adminFee = roundToTwo((subtotal * normalizedFeeRate) / 100);
  }

  const total = roundToTwo(subtotal + adminFee);
  const isFree = total === 0;

  return {
    basePrice,
    discount,
    subtotal,
    adminFee,
    total,
    feeRate: normalizedFeeRate,
    isFree,
  };
}
