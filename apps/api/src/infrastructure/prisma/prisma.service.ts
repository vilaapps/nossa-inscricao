import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Retorna uma instância do Prisma Client vinculada a uma transação com isolamento de RLS (tenant e usuário)
   * configurada de forma parametrizada e segura.
   */
  withTenant(tenantId: string, userId?: string) {
    const prisma = this;
    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            // Envelopa a operação em uma transação local para que o SET LOCAL (via set_config) funcione
            return prisma.$transaction(async (tx: any) => {
              // Configura o ID do Tenant da sessão para RLS de forma parametrizada
              await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
              
              if (userId) {
                await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
              }

              return query(args);
            });
          },
        },
      },
    });
  }
}
