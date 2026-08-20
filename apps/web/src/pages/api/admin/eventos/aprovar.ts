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
      return new Response(JSON.stringify({ message: 'Acesso negado. Apenas administradores podem aprovar eventos.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Extrair dados da requisição
    const body = await request.json();
    const { eventId } = body;

    if (!eventId) {
      return new Response(JSON.stringify({ message: 'eventId é obrigatório.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Buscar o evento para validar status atual
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return new Response(JSON.stringify({ message: 'Evento não encontrado.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (event.status !== 'DRAFT') {
      return new Response(JSON.stringify({ message: 'Apenas eventos em rascunho (DRAFT) podem ser aprovados.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Atualizar o status do Evento para PUBLISHED no banco de dados
    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: {
        status: 'PUBLISHED',
      },
    });

    return new Response(JSON.stringify({ success: true, eventId: updatedEvent.id, status: updatedEvent.status }), {
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
