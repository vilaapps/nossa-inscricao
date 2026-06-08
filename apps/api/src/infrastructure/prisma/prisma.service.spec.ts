import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

// Mock dos métodos do PrismaClient herdados por PrismaService
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);
const mockExtends = jest.fn();
const mockTransaction = jest.fn();

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: class {
      $connect = mockConnect;
      $disconnect = mockDisconnect;
      $extends = mockExtends;
      $transaction = mockTransaction;
    },
  };
});

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mockar a implementação de $extends para retornar a si mesmo para encadeamento de métodos nos testes
    mockExtends.mockImplementation(function (this: any, config: any) {
      // Retorna uma referência que contém os métodos necessários
      return this;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  // deve conectar ao banco de dados ao inicializar o módulo
  it('should connect to the database on module init', async () => {
    // Arrange & Act
    await service.onModuleInit();

    // Assert
    expect(mockConnect).toHaveBeenCalled();
  });

  // deve desconectar do banco de dados ao destruir o módulo
  it('should disconnect from the database on module destroy', async () => {
    // Arrange & Act
    await service.onModuleDestroy();

    // Assert
    expect(mockDisconnect).toHaveBeenCalled();
  });

  // deve configurar a extensão do Prisma Client com RLS ao chamar comTenant
  it('should extend prisma client with RLS configurations', async () => {
    // Arrange
    let capturedConfig: any = null;
    mockExtends.mockImplementation(function (config: any) {
      capturedConfig = config;
      return this;
    });

    const tenantId = 'org-123';
    const userId = 'user-456';

    // Act
    service.withTenant(tenantId, userId);

    // Assert
    expect(mockExtends).toHaveBeenCalled();
    expect(capturedConfig).toBeDefined();
    expect(capturedConfig.query.$allModels.$allOperations).toBeDefined();

    // Testar o comportamento do interceptador de queries ($allOperations)
    const mockTx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    
    mockTransaction.mockImplementation(async (callback: any) => {
      return callback(mockTx);
    });

    const mockQuery = jest.fn().mockResolvedValue('query-result');
    const allOpsCallback = capturedConfig.query.$allModels.$allOperations;

    // Chamar callback simulando uma operação do Prisma
    const result = await allOpsCallback({
      model: 'Event',
      operation: 'findMany',
      args: { where: { id: '1' } },
      query: mockQuery,
    });

    // Validar as assertions dentro do fluxo de transação do RLS
    expect(result).toBe('query-result');
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(mockQuery).toHaveBeenCalledWith({ where: { id: '1' } });
  });

  // deve configurar apenas o tenantId se o userId não for provido
  it('should configure only tenantId in query if userId is omitted', async () => {
    // Arrange
    let capturedConfig: any = null;
    mockExtends.mockImplementation(function (config: any) {
      capturedConfig = config;
      return this;
    });

    const tenantId = 'org-123';

    // Act
    service.withTenant(tenantId);

    // Assert
    const mockTx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    
    mockTransaction.mockImplementation(async (callback: any) => {
      return callback(mockTx);
    });

    const mockQuery = jest.fn().mockResolvedValue('result');
    const allOpsCallback = capturedConfig.query.$allModels.$allOperations;

    // Chamar callback simulando uma operação
    await allOpsCallback({
      model: 'Event',
      operation: 'findMany',
      args: {},
      query: mockQuery,
    });

    // Deve executar apenas 1 comando SQL ($executeRaw) correspondente ao tenantId
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
