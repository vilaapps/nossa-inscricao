import { ValueObject } from './value-object.base';

interface StubVoProps {
  street: string;
  number: number;
}

class StubValueObject extends ValueObject<StubVoProps> {}

describe('ValueObject Base Class', () => {
  // deve congelar as propriedades no construtor
  it('should freeze props on initialization to guarantee immutability', () => {
    // Arrange
    const props = { street: 'Main St', number: 100 };
    const vo = new StubValueObject(props);

    // Act & Assert
    // O modificador de propriedades congeladas deve lançar erro em modo estrito
    expect(() => {
      (vo as any).props.number = 200;
    }).toThrow();
  });

  // deve retornar falso se comparado com null ou undefined
  it('should return false when comparing with null or undefined', () => {
    // Arrange
    const vo = new StubValueObject({ street: 'Main St', number: 100 });

    // Act
    const comparedToNull = vo.equals(null as any);
    const comparedToUndefined = vo.equals(undefined as any);

    // Assert
    expect(comparedToNull).toBe(false);
    expect(comparedToUndefined).toBe(false);
  });

  // deve retornar falso se comparado com um objeto sem propriedades validas
  it('should return false when comparing with an object that has undefined props', () => {
    // Arrange
    const vo = new StubValueObject({ street: 'Main St', number: 100 });
    const emptyVo = Object.create(StubValueObject.prototype);

    // Act
    const result = vo.equals(emptyVo);

    // Assert
    expect(result).toBe(false);
  });

  // deve retornar verdadeiro se as propriedades estruturais forem identicas
  it('should return true when properties are structurally identical', () => {
    // Arrange
    const props1 = { street: 'Main St', number: 100 };
    const props2 = { street: 'Main St', number: 100 };
    const vo1 = new StubValueObject(props1);
    const vo2 = new StubValueObject(props2);

    // Act
    const result = vo1.equals(vo2);

    // Assert
    expect(result).toBe(true);
  });

  // deve retornar falso se as propriedades estruturais forem diferentes
  it('should return false when properties are structurally different', () => {
    // Arrange
    const vo1 = new StubValueObject({ street: 'Main St', number: 100 });
    const vo2 = new StubValueObject({ street: 'Main St', number: 200 });
    const vo3 = new StubValueObject({ street: 'Wall St', number: 100 });

    // Act
    const result1 = vo1.equals(vo2);
    const result2 = vo1.equals(vo3);

    // Assert
    expect(result1).toBe(false);
    expect(result2).toBe(false);
  });
});
