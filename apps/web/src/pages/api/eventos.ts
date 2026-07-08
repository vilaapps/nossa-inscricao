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
    // Validar role do organizador/admin no banco
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || (user.role !== 'ORGANIZER' && user.role !== 'ADMIN')) {
      return new Response(JSON.stringify({ message: 'Acesso negado. Apenas organizadores podem criar eventos.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tenantId = user.tenantId || 'tenant-1';
    const body = await request.json();
    
    const { title, description, date, availableSlots, categories, batches, contractText, contractPdf } = body;

    // Validações básicas
    if (!title || !date || !availableSlots) {
      return new Response(JSON.stringify({ message: 'Título, data e limite de vagas são obrigatórios.' }), {
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

    if (!batches || batches.length === 0) {
      return new Response(JSON.stringify({ message: 'O evento precisa ter pelo menos um lote ativo de inscrição.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Gerar slug a partir do título de forma limpa
    const slug = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    // Verificar se slug já existe para evitar colisão
    const existingEvent = await prisma.event.findUnique({
      where: { slug },
    });

    if (existingEvent) {
      return new Response(JSON.stringify({ message: 'Já existe um evento cadastrado com esse título ou slug semelhante.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Criar o evento em cascata
    const newEvent = await prisma.event.create({
      data: {
        title,
        slug,
        description: description || '',
        date: new Date(date),
        availableSlots: Number(availableSlots),
        status: 'DRAFT',
        tenantId,
        contractText: contractText || null,
        contractPdf: contractPdf || null,
        categories: {
          create: categories.map((cat: any) => ({
            name: cat.name,
            gender: cat.gender || 'MISTO',
            price: 0,
            availableSlots: Number(cat.slots || availableSlots),
            tenantId,
          })),
        },
        batches: {
          create: batches.map((bat: any, index: number) => ({
            name: bat.name,
            price: bat.price.toString(),
            active: index === 0, // Primeiro lote ativo por padrão
            tenantId,
          })),
        },
      },
    });

    return new Response(JSON.stringify({ success: true, eventId: newEvent.id }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Erro na criação de evento:', err);
    return new Response(JSON.stringify({ message: err.message || 'Erro interno do servidor.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    await prisma.$disconnect();
  }
};
