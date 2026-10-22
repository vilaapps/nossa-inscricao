import type { APIRoute } from 'astro';
import { PrismaClient } from '@prisma/client';
import { validateEventPayload, normalizeEventPayload, validateBatchPlan, sanitizeGoogleMapsEmbedUrl, sanitizeYouTubeEmbedUrl } from '@syncflow/shared';

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
    
    const { title, description, date, availableSlots, eventType, location, locationUrl, bannerUrl, logoUrl, trailerUrl, categories, batches, contractText, contractPdf, hasKit, kitSizes, adminFeeRate, registrationOpensAt } = body;

    // Validação com regras compartilhadas de evento
    const validation = validateEventPayload({
      name: title,
      date,
      registrationOpensAt,
      hasKit,
      kitSizes,
      adminFeeRate,
    });

    if (!validation.valid) {
      return new Response(JSON.stringify({ message: validation.errors.join(' ') }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const normalized = normalizeEventPayload({
      hasKit,
      kitSizes,
      adminFeeRate,
    });

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

    const totalCategorySlots = categories.reduce((sum: number, cat: any) => sum + Number(cat.slots || cat.totalSlots || 0), 0);
    if (totalCategorySlots > Number(availableSlots)) {
      return new Response(JSON.stringify({ message: `A soma das vagas das categorias (${totalCategorySlots}) não pode ultrapassar o limite geral do evento (${availableSlots}).` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validar plano de lotes para cada categoria
    for (const cat of categories) {
      const catBatches = cat.batches && cat.batches.length > 0 ? cat.batches : batches;
      if (!catBatches || catBatches.length === 0) {
        return new Response(JSON.stringify({ message: `A categoria "${cat.name}" precisa ter pelo menos um lote ativo de inscrição.` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const categoryTotalSlots = Number(cat.slots || cat.totalSlots || availableSlots);
      const batchPlanResult = validateBatchPlan(
        catBatches.map((b: any, index: number) => ({
          name: b.name,
          type: b.type || 'DATE',
          position: b.position !== undefined ? Number(b.position) : index + 1,
          price: Number(b.price || 0),
          startDate: b.startDate,
          endDate: b.endDate,
          maxQuantity: b.maxQuantity !== undefined && b.maxQuantity !== null && b.maxQuantity !== '' ? Number(b.maxQuantity) : null,
        })),
        {
          name: cat.name,
          totalSlots: categoryTotalSlots,
        },
        {
          date,
          registrationOpensAt,
        },
      );

      if (!batchPlanResult.valid) {
        return new Response(JSON.stringify({ message: `Categoria "${cat.name}": ${batchPlanResult.errors.join(' ')}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
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

    // Criar o evento, categorias e lotes em transação
    const newEvent = await prisma.$transaction(async (tx) => {
      const createdEvent = await tx.event.create({
        data: {
          title,
          slug,
          description: description || '',
          date: new Date(date),
          registrationOpensAt: registrationOpensAt ? new Date(registrationOpensAt) : null,
          availableSlots: Number(availableSlots),
          eventType: eventType || 'CORRIDA',
          hasKit: normalized.hasKit,
          kitSizes: normalized.kitSizes,
          adminFeeRate: normalized.adminFeeRate,
          location: location || null,
          locationUrl: sanitizeGoogleMapsEmbedUrl(locationUrl),
          bannerUrl: bannerUrl || null,
          logoUrl: logoUrl || null,
          trailerUrl: sanitizeYouTubeEmbedUrl(trailerUrl),
          status: 'DRAFT',
          tenantId,
          contractText: contractText || null,
          contractPdf: contractPdf || null,
        },
      });

      for (const cat of categories) {
        const catTotalSlots = Number(cat.slots || cat.totalSlots || availableSlots);
        const createdCategory = await tx.category.create({
          data: {
            eventId: createdEvent.id,
            tenantId,
            name: cat.name,
            gender: cat.gender || 'MISTO',
            minAge: cat.minAge ? Number(cat.minAge) : null,
            maxAge: cat.maxAge ? Number(cat.maxAge) : null,
            price: 0,
            totalSlots: catTotalSlots,
            availableSlots: catTotalSlots,
          },
        });

        const catBatches = cat.batches && cat.batches.length > 0 ? cat.batches : batches;
        for (let i = 0; i < catBatches.length; i++) {
          const bat = catBatches[i];
          await tx.batch.create({
            data: {
              eventId: createdEvent.id,
              categoryId: createdCategory.id,
              tenantId,
              name: bat.name,
              price: bat.price.toString(),
              type: bat.type || 'DATE',
              position: bat.position !== undefined ? Number(bat.position) : i + 1,
              startDate: bat.startDate ? new Date(bat.startDate) : null,
              endDate: bat.endDate ? new Date(bat.endDate) : null,
              maxQuantity: bat.maxQuantity !== undefined && bat.maxQuantity !== null && bat.maxQuantity !== '' ? Number(bat.maxQuantity) : null,
              soldQuantity: 0,
              active: i === 0,
            },
          });
        }
      }

      return createdEvent;
    });

    return new Response(JSON.stringify({ success: true, eventId: newEvent.id }), {
      status: 201,
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
