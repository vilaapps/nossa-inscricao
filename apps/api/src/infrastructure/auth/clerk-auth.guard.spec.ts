import { ClerkAuthGuard } from './clerk-auth.guard';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { verifyToken } from '@clerk/backend';

// Mock do Clerk Backend
jest.mock('@clerk/backend', () => {
  return {
    verifyToken: jest.fn(),
  };
});

describe('ClerkAuthGuard', () => {
  let guard: ClerkAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new ClerkAuthGuard();
  });

  const createMockContext = (headers: Record<string, string>): ExecutionContext => {
    const request = {
      headers,
      user: undefined,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  // deve autorizar se estiver em modo teste/dev e com header x-user-id
  it('should authorize if in test/dev mode and x-user-id header is provided', async () => {
    // Arrange
    const context = createMockContext({ 'x-user-id': 'usr_test_123' });
    process.env.NODE_ENV = 'test';

    // Act
    const result = await guard.canActivate(context);

    // Assert
    const request = context.switchToHttp().getRequest();
    expect(result).toBe(true);
    expect(request.user).toEqual({ id: 'usr_test_123' });
  });

  // deve lancar erro se nao houver header authorization
  it('should throw UnauthorizedException if authorization header is missing', async () => {
    // Arrange
    const context = createMockContext({});
    // Garante que não cai no bypass limpando a variável do Clerk
    process.env.CLERK_SECRET_KEY = 'some-key';
    process.env.NODE_ENV = 'production';

    // Act & Assert
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Missing authorization token'),
    );
  });

  // deve lancar erro se o formato do token for invalido
  it('should throw UnauthorizedException if authorization format is invalid', async () => {
    // Arrange
    const context = createMockContext({ authorization: 'Basic credentials' });
    process.env.CLERK_SECRET_KEY = 'some-key';
    process.env.NODE_ENV = 'production';

    // Act & Assert
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid authorization token format'),
    );
  });

  // deve autorizar com sucesso com token Bearer valido
  it('should authorize and inject user info if token is verified successfully', async () => {
    // Arrange
    const context = createMockContext({ authorization: 'Bearer token_valido' });
    process.env.CLERK_SECRET_KEY = 'some-key';
    process.env.NODE_ENV = 'production';

    (verifyToken as jest.Mock).mockResolvedValueOnce({ sub: 'usr_clerk_999' });

    // Act
    const result = await guard.canActivate(context);

    // Assert
    const request = context.switchToHttp().getRequest();
    expect(result).toBe(true);
    expect(request.user).toEqual({ id: 'usr_clerk_999' });
    expect(verifyToken).toHaveBeenCalledWith('token_valido', { secretKey: 'some-key' });
  });

  // deve lancar erro se o token for invalido no Clerk
  it('should throw UnauthorizedException if Clerk token verification fails', async () => {
    // Arrange
    const context = createMockContext({ authorization: 'Bearer token_expirado' });
    process.env.CLERK_SECRET_KEY = 'some-key';
    process.env.NODE_ENV = 'production';

    (verifyToken as jest.Mock).mockRejectedValueOnce(new Error('Token expired'));

    // Act & Assert
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Unauthorized: Token expired'),
    );
  });
});
