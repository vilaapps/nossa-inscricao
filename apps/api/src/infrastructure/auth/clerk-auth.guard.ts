import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyToken } from '@clerk/backend';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Em testes ou desenvolvimento local sem chaves ativas do Clerk, permite usar header x-user-id
    const userIdHeader = request.headers['x-user-id'];
    const isTestOrDev = process.env.NODE_ENV === 'test' || !process.env.CLERK_SECRET_KEY;

    if (isTestOrDev && userIdHeader) {
      request.user = { id: userIdHeader };
      return true;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization token');
    }

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authorization token format');
    }

    try {
      const verified = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY || 'mock-secret',
      });
      request.user = { id: verified.sub };
      return true;
    } catch (error) {
      throw new UnauthorizedException(`Unauthorized: ${(error as Error).message}`);
    }
  }
}
