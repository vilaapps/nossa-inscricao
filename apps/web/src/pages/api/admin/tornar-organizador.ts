import type { APIRoute } from 'astro';
import { PrismaClient } from '@prisma/client';

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = locals.auth();
  const userId = auth.userId;

  if (!userId) {
    return new Response(JSON.stringify({ message: 'Usuário não autenticado.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const prisma = new PrismaClient();

  try {
    const body = await request.json();
    const { organizationName, cpfCnpj, email, name } = body;

    if (!organizationName || !cpfCnpj || !email) {
      return new Response(JSON.stringify({ message: 'Nome da organização, CPF/CNPJ e E-mail são obrigatórios.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Gerar um ID único para o Tenant
    const tenantId = `tenant-${crypto.randomUUID()}`;

    // Executar a transação no banco de dados para criar o Tenant e atualizar/criar o Usuário
    const result = await prisma.$transaction(async (tx) => {
      // 1. Criar o Tenant
      const newTenant = await tx.tenant.create({
        data: {
          id: tenantId,
          name: organizationName,
          commissionRate: 10.00, // Taxa padrão de 10%
        },
      });

      // 2. Criar ou atualizar o Usuário local com a role de ORGANIZER
      const updatedUser = await tx.user.upsert({
        where: { id: userId },
        update: {
          role: 'ORGANIZER',
          tenantId: tenantId,
          metadata: { cpfCnpj },
        },
        create: {
          id: userId,
          email,
          name: name || '',
          role: 'ORGANIZER',
          tenantId: tenantId,
          metadata: { cpfCnpj },
        },
      });

      return { newTenant, updatedUser };
    });

    return new Response(JSON.stringify({ success: true, tenantId: result.newTenant.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Erro ao tornar organizador:', err);
    return new Response(JSON.stringify({ message: err.message || 'Erro interno do servidor.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    await prisma.$disconnect();
  }
};
