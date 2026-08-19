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
    // 1. Validar se o usuário atual existe e obter dados
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || (user.role !== 'ORGANIZER' && user.role !== 'ADMIN')) {
      return new Response(JSON.stringify({ message: 'Acesso negado. Apenas organizadores ou administradores podem arquivar eventos.' }), {
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

    // 3. Buscar o evento para validar permissão e status
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return new Response(JSON.stringify({ message: 'Evento não encontrado.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Apenas admins podem arquivar qualquer evento, organizadores só podem arquivar os seus próprios
    if (user.role === 'ORGANIZER' && event.tenantId !== user.tenantId) {
      return new Response(JSON.stringify({ message: 'Acesso negado. Você só pode arquivar eventos da sua organização.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Arquivar logicamente o evento
    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date()
      }
    });

    return new Response(JSON.stringify({ success: true, message: 'Evento arquivado com sucesso.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Erro ao arquivar evento:', err);
    return new Response(JSON.stringify({ message: err.message || 'Erro interno do servidor.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    await prisma.$disconnect();
  }
};
