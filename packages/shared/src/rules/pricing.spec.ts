import { describe, it, expect } from 'vitest';
import { calcOrder, effectiveFeeRate } from './pricing';

describe('effectiveFeeRate', () => {
  // Deve priorizar a taxa de 0% do evento sobre a taxa do tenant (regressão do bug || 10)
  it('should return 0 when event fee rate is explicitly 0 and tenant is 10', () => {
    // Arrange
    const event = { adminFeeRate: 0 };
    const tenant = { commissionRate: 10 };

    // Act
    const result = effectiveFeeRate(event, tenant);

    // Assert
    expect(result).toBe(0);
  });

  // Deve priorizar o override do evento quando especificado um valor positivo
  it('should return event adminFeeRate when specified as a positive number', () => {
    // Arrange
    const event = { adminFeeRate: 5 };
    const tenant = { commissionRate: 10 };

    // Act
    const result = effectiveFeeRate(event, tenant);

    // Assert
    expect(result).toBe(5);
  });

  // Deve utilizar a taxa do tenant quando o evento tiver override nulo
  it('should fallback to tenant commissionRate when event override is null', () => {
    // Arrange
    const event = { adminFeeRate: null };
    const tenant = { commissionRate: 12.5 };

    // Act
    const result = effectiveFeeRate(event, tenant);

    // Assert
    expect(result).toBe(12.5);
  });

  // Deve utilizar a taxa do tenant quando o objeto de evento for indefinido ou nulo
  it('should fallback to tenant commissionRate when event is undefined or null', () => {
    // Arrange
    const tenant = { commissionRate: 8 };

    // Act
    const result = effectiveFeeRate(null, tenant);

    // Assert
    expect(result).toBe(8);
  });

  // Deve retornar 0 quando ambos evento e tenant forem nulos ou indefinidos
  it('should return 0 when both event and tenant are undefined or null', () => {
    // Arrange & Act
    const result = effectiveFeeRate(null, null);

    // Assert
    expect(result).toBe(0);
  });

  // Deve ignorar string inválida no adminFeeRate do evento e recorrer ao tenant
  it('should ignore NaN string in event fee rate and fallback to tenant', () => {
    // Arrange
    const event = { adminFeeRate: 'invalid' };
    const tenant = { commissionRate: 15 };

    // Act
    const result = effectiveFeeRate(event, tenant);

    // Assert
    expect(result).toBe(15);
  });

  // Deve ignorar string inválida na taxa do tenant e retornar 0
  it('should ignore NaN string in tenant fee rate and return 0', () => {
    // Arrange
    const tenant = { commissionRate: 'invalid' };

    // Act
    const result = effectiveFeeRate(null, tenant);

    // Assert
    expect(result).toBe(0);
  });
});

describe('calcOrder', () => {
  // Deve calcular pedido padrão sem cupom e com taxa de 10%
  it('should calculate standard order with 10% admin fee and no coupon', () => {
    // Arrange
    const params = {
      basePrice: 100,
      feeRate: 10,
    };

    // Act
    const result = calcOrder(params);

    // Assert
    expect(result).toEqual({
      basePrice: 100,
      discount: 0,
      subtotal: 100,
      adminFee: 10,
      total: 110,
      feeRate: 10,
      isFree: false,
    });
  });

  // Deve zerar a taxa quando feeRate for 0% e igualar total ao subtotal
  it('should charge no fee and set total equal to subtotal when feeRate is 0%', () => {
    // Arrange
    const params = {
      basePrice: 150,
      feeRate: 0,
    };

    // Act
    const result = calcOrder(params);

    // Assert
    expect(result).toEqual({
      basePrice: 150,
      discount: 0,
      subtotal: 150,
      adminFee: 0,
      total: 150,
      feeRate: 0,
      isFree: false,
    });
  });

  // Deve aplicar cupom percentual de 15% corretamente
  it('should calculate discount with percentage coupon', () => {
    // Arrange
    const params = {
      basePrice: 100,
      coupon: {
        code: 'PROMO15',
        discountType: 'PERCENTAGE' as const,
        discountValue: 15,
      },
      feeRate: 10,
    };

    // Act
    const result = calcOrder(params);

    // Assert
    expect(result.discount).toBe(15);
    expect(result.subtotal).toBe(85);
    expect(result.adminFee).toBe(8.5);
    expect(result.total).toBe(93.5);
    expect(result.isFree).toBe(false);
  });

  // Deve aplicar cupom de valor fixo corretamente
  it('should calculate discount with fixed coupon', () => {
    // Arrange
    const params = {
      basePrice: 100,
      coupon: {
        code: 'VALE20',
        discountType: 'FIXED' as const,
        discountValue: 20,
      },
      feeRate: 10,
    };

    // Act
    const result = calcOrder(params);

    // Assert
    expect(result.discount).toBe(20);
    expect(result.subtotal).toBe(80);
    expect(result.adminFee).toBe(8);
    expect(result.total).toBe(88);
    expect(result.isFree).toBe(false);
  });

  // Deve limitar o desconto ao valor base quando o cupom fixo for maior que o preço
  it('should cap discount at basePrice when fixed coupon exceeds base price', () => {
    // Arrange
    const params = {
      basePrice: 50,
      coupon: {
        code: 'VALE100',
        discountType: 'FIXED' as const,
        discountValue: 100,
      },
      feeRate: 10,
    };

    // Act
    const result = calcOrder(params);

    // Assert
    expect(result.discount).toBe(50);
    expect(result.subtotal).toBe(0);
    expect(result.adminFee).toBe(0);
    expect(result.total).toBe(0);
    expect(result.isFree).toBe(true);
  });

  // Deve tratar cupom de 100% como gratuito, zerando taxa administrativa
  it('should treat 100% discount coupon as free order with zero fee', () => {
    // Arrange
    const params = {
      basePrice: 120,
      coupon: {
        code: 'GRATIS100',
        discountType: 'PERCENTAGE' as const,
        discountValue: 100,
      },
      feeRate: 10,
    };

    // Act
    const result = calcOrder(params);

    // Assert
    expect(result.discount).toBe(120);
    expect(result.subtotal).toBe(0);
    expect(result.adminFee).toBe(0);
    expect(result.total).toBe(0);
    expect(result.isFree).toBe(true);
  });

  // Deve tratar evento gratuito com lote 0 como gratuito com taxa 0 mesmo se feeRate for 10%
  it('should treat basePrice of 0 as free order with zero fee regardless of feeRate', () => {
    // Arrange
    const params = {
      basePrice: 0,
      feeRate: 10,
    };

    // Act
    const result = calcOrder(params);

    // Assert
    expect(result).toEqual({
      basePrice: 0,
      discount: 0,
      subtotal: 0,
      adminFee: 0,
      total: 0,
      feeRate: 10,
      isFree: true,
    });
  });

  // Deve arredondar em 2 casas decimais e evitar erros de precisão de ponto flutuante
  it('should round calculations to 2 decimal places and avoid float inaccuracies', () => {
    // Arrange
    const params = {
      basePrice: 33.33,
      feeRate: 7.5,
    };

    // Act
    const result = calcOrder(params);

    // Assert
    // 33.33 * 0.075 = 2.49975 -> 2.50
    // total = 33.33 + 2.50 = 35.83
    expect(result.adminFee).toBe(2.5);
    expect(result.total).toBe(35.83);
  });

  // Deve lidar com feeRate nulo ou negativo assumindo taxa 0
  it('should default feeRate to 0 if null, undefined, or negative', () => {
    // Arrange
    const paramsNegative = {
      basePrice: 80,
      feeRate: -5,
    };
    const paramsUndefined = {
      basePrice: 80,
    };

    // Act
    const resultNeg = calcOrder(paramsNegative);
    const resultUndef = calcOrder(paramsUndefined);

    // Assert
    expect(resultNeg.adminFee).toBe(0);
    expect(resultNeg.total).toBe(80);
    expect(resultNeg.feeRate).toBe(0);

    expect(resultUndef.adminFee).toBe(0);
    expect(resultUndef.total).toBe(80);
    expect(resultUndef.feeRate).toBe(0);
  });
});
