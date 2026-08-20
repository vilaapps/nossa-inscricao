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
    // 1. Validar se o usuário atual é ADMIN no banco de dados local
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.role !== 'ADMIN') {
      return new Response(JSON.stringify({ message: 'Acesso negado. Apenas administradores podem alterar comissões.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Extrair dados da requisição
    const body = await request.json();
    const { tenantId, commissionRate } = body;

    if (!tenantId || commissionRate === undefined) {
      return new Response(JSON.stringify({ message: 'tenantId e commissionRate são obrigatórios.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rate = parseFloat(commissionRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      return new Response(JSON.stringify({ message: 'A taxa de comissão deve ser um número entre 0 e 100.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Atualizar a comissão do Tenant no banco de dados
    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        commissionRate: rate,
      },
    });

    return new Response(JSON.stringify({ success: true, tenantId: updatedTenant.id, commissionRate: Number(updatedTenant.commissionRate) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Erro na rota:', err);
    
    // Tenta salvar o log de forma segura
    try {
      const errorData = JSON.parse(JSON.stringify(err, Object.getOwnPropertyNames(err)));
      // Garante que prisma está instanciado no escopo
      if (typeof prisma !== 'undefined') {
        await prisma.systemLog.create({
          data: {
            source: 'BACKEND',
            errorData: errorData,
          }
        });
      }
    } catch (logErr) {
      console.error('Erro ao salvar log no banco:', logErr);
    }
    
    // Filtro de segurança para não expor detalhes de banco ao cliente
    const isPrismaError = err.clientVersion || err.code || err.meta;
    const isSupabaseError = err.__isStorageError || err.status === 400 || err.status === 403;
    const clientMessage = (isPrismaError || isSupabaseError) 
      ? 'Ocorreu um erro interno no servidor ao processar sua requisição.' 
      : (err.message || 'Erro interno do servidor.');

    return new Response(JSON.stringify({ message: clientMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    await prisma.$disconnect();
  }
};
