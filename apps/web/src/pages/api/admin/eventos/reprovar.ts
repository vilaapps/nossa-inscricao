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
      return new Response(JSON.stringify({ message: 'Acesso negado. Apenas administradores podem reprovar eventos.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Extrair dados da requisição
    const body = await request.json();
    const { eventId, reason } = body;

    if (!eventId || !reason) {
      return new Response(JSON.stringify({ message: 'eventId e reason (motivo) são obrigatórios.' }), {
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
      return new Response(JSON.stringify({ message: 'Apenas eventos em rascunho (DRAFT) podem ser reprovados.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Atualizar o status do Evento para REJECTED no banco de dados
    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: {
        status: 'REJECTED',
        rejectionReason: reason,
        rejectedAt: new Date()
      },
    });

    return new Response(JSON.stringify({ success: true, eventId: updatedEvent.id, status: updatedEvent.status }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Erro ao reprovar evento:', err);
    return new Response(JSON.stringify({ message: err.message || 'Erro interno do servidor.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    await prisma.$disconnect();
  }
};
