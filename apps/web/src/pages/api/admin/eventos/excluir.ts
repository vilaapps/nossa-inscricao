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
      return new Response(JSON.stringify({ message: 'Acesso negado. Apenas organizadores ou administradores podem excluir eventos.' }), {
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

    // 3. Buscar o evento com inscrições para validar permissão e status
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        registrations: {
          where: {
            OR: [
              { status: 'CONFIRMED' },
              { paymentStatus: 'PAID' },
            ]
          }
        }
      }
    });

    if (!event) {
      return new Response(JSON.stringify({ message: 'Evento não encontrado.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Apenas admins podem excluir qualquer evento, organizadores só podem excluir os seus próprios
    if (user.role === 'ORGANIZER' && event.tenantId !== user.tenantId) {
      return new Response(JSON.stringify({ message: 'Acesso negado. Você só pode excluir eventos da sua organização.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validar status permitidos para exclusão
    const isDraft = event.status === 'DRAFT';
    const isRejected = event.status === 'REJECTED';
    const isPublishedWithoutRegistrations = event.status === 'PUBLISHED' && event.registrations.length === 0;

    if (!isDraft && !isRejected && !isPublishedWithoutRegistrations) {
      return new Response(JSON.stringify({ 
        message: 'Acesso negado. Apenas rascunhos, eventos rejeitados ou eventos publicados sem nenhuma inscrição paga podem ser excluídos.' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Excluir o evento fisicamente
    await prisma.event.delete({
      where: { id: eventId },
    });

    return new Response(JSON.stringify({ success: true, message: 'Evento excluído com sucesso.' }), {
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
