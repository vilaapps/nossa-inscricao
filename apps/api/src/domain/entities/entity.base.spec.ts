import { Entity } from './entity.base';

// Classe concreta de teste derivada da classe abstrata Entity
interface StubProps {
  name: string;
}

class StubEntity extends Entity<StubProps> {}

describe('Entity Base Class', () => {
  // deve instanciar uma entidade com um UUID gerado caso nao seja provido
  it('should instantiate an entity with an auto-generated UUID if none is provided', () => {
    // Arrange
    const props = { name: 'Test Name' };

    // Act
    const entity = new StubEntity(props);

    // Assert
    expect(entity.id).toBeDefined();
    expect(typeof entity.id).toBe('string');
    expect(entity.id.length).toBeGreaterThan(0);
  });

  // deve instanciar uma entidade com o ID passado por parametro
  it('should instantiate an entity with the provided custom ID', () => {
    // Arrange
    const props = { name: 'Test Name' };
    const customId = 'custom-uuid-123';

    // Act
    const entity = new StubEntity(props, customId);

    // Assert
    expect(entity.id).toBe(customId);
  });

  // deve retornar falso se comparada com null ou undefined
  it('should return false when comparing with null or undefined', () => {
    // Arrange
    const entity = new StubEntity({ name: 'Test' });

    // Act
    const comparedToNull = entity.equals(null as any);
    const comparedToUndefined = entity.equals(undefined as any);

    // Assert
    expect(comparedToNull).toBe(false);
    expect(comparedToUndefined).toBe(false);
  });

  // deve retornar verdadeiro se comparada a si mesma
  it('should return true when comparing to the exact same instance', () => {
    // Arrange
    const entity = new StubEntity({ name: 'Test' });

    // Act
    const result = entity.equals(entity);

    // Assert
    expect(result).toBe(true);
  });

  // deve retornar verdadeiro se comparada a outra entidade com o mesmo ID
  it('should return true when comparing to another entity with the same ID', () => {
    // Arrange
    const commonId = 'common-id-123';
    const entity1 = new StubEntity({ name: 'Test 1' }, commonId);
    const entity2 = new StubEntity({ name: 'Test 2' }, commonId);

    // Act
    const result = entity1.equals(entity2);

    // Assert
    expect(result).toBe(true);
  });

  // deve retornar falso se comparada a outra entidade com ID diferente
  it('should return false when comparing to another entity with a different ID', () => {
    // Arrange
    const entity1 = new StubEntity({ name: 'Test' }, 'id-1');
    const entity2 = new StubEntity({ name: 'Test' }, 'id-2');

    // Act
    const result = entity1.equals(entity2);

    // Assert
    expect(result).toBe(false);
  });
});
