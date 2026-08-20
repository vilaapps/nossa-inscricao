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
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || (user.role !== 'ORGANIZER' && user.role !== 'ADMIN')) {
      return new Response(JSON.stringify({ message: 'Acesso negado. Apenas organizadores ou administradores podem editar eventos.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    
    const { eventId, title, description, date, availableSlots, eventType, location, locationUrl, bannerUrl, logoUrl, trailerUrl, categories, batches, contractText, contractPdf } = body;

    if (!eventId || !title || !date || !availableSlots) {
      return new Response(JSON.stringify({ message: 'ID, título, data e limite de vagas são obrigatórios.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const selectedDate = new Date(date);
    const now = new Date();
    
    // O evento deve acontecer estritamente no futuro, mesmo na edição
    if (selectedDate <= now) {
      return new Response(JSON.stringify({ message: 'A data e horário do evento devem ser no futuro.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!categories || categories.length === 0) {
      return new Response(JSON.stringify({ message: 'O evento precisa ter pelo menos uma categoria cadastrada.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const totalCategorySlots = categories.reduce((sum: number, cat: any) => sum + Number(cat.slots || 0), 0);
    if (totalCategorySlots > Number(availableSlots)) {
      return new Response(JSON.stringify({ message: `A soma das vagas das categorias (${totalCategorySlots}) não pode ultrapassar o limite geral do evento (${availableSlots}).` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!batches || batches.length === 0) {
      return new Response(JSON.stringify({ message: 'O evento precisa ter pelo menos um lote ativo de inscrição.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Buscar o evento
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return new Response(JSON.stringify({ message: 'Evento não encontrado.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validar tenant
    if (user.role === 'ORGANIZER' && event.tenantId !== user.tenantId) {
      return new Response(JSON.stringify({ message: 'Acesso negado. Você só pode editar eventos da sua organização.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validar status DRAFT ou REJECTED
    if (event.status !== 'DRAFT' && event.status !== 'REJECTED') {
      return new Response(JSON.stringify({ message: 'Acesso negado. Eventos aprovados não podem ser editados.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Gerar slug a partir do título
    const slug = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    // Verificar colisão de slug com outro evento
    const existingEvent = await prisma.event.findFirst({
      where: {
        slug,
        NOT: { id: eventId },
      },
    });

    if (existingEvent) {
      return new Response(JSON.stringify({ message: 'Já existe outro evento cadastrado com esse título ou slug semelhante.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Executar atualização em transação para garantir atomicidade das categorias/lotes
    await prisma.$transaction(async (tx) => {
      // 1. Deletar categorias e lotes existentes
      await tx.category.deleteMany({ where: { eventId } });
      await tx.batch.deleteMany({ where: { eventId } });

      // 2. Atualizar o evento e criar novas categorias/lotes
      await tx.event.update({
        where: { id: eventId },
        data: {
          title,
          slug,
          description: description || '',
          date: new Date(date),
          availableSlots: Number(availableSlots),
          eventType: eventType || 'CORRIDA',
          location: location || null,
          locationUrl: locationUrl || null,
          bannerUrl: bannerUrl || null,
          logoUrl: logoUrl || null,
          trailerUrl: trailerUrl || null,
          contractText: contractText || null,
          contractPdf: contractPdf || null,
          status: 'DRAFT', // Reseta o status para rascunho
          rejectionReason: null, // Limpa o motivo da rejeição
          rejectedAt: null, // Limpa a data de rejeição
          categories: {
            create: categories.map((cat: any) => ({
              name: cat.name,
              gender: cat.gender || 'MISTO',
              price: 0,
              availableSlots: Number(cat.slots || availableSlots),
              tenantId: event.tenantId,
            })),
          },
          batches: {
            create: batches.map((bat: any, index: number) => ({
              name: bat.name,
              price: bat.price.toString(),
              active: index === 0, // Primeiro lote ativo por padrão
              tenantId: event.tenantId,
            })),
          },
        },
      });
    });

    return new Response(JSON.stringify({ success: true, eventId }), {
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
