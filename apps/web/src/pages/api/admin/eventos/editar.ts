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
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    const isSuperAdmin = user?.role === 'ADMIN' || user?.email === 'nossainscricao@gmail.com';

    if (!user || (!isSuperAdmin && user.role !== 'ORGANIZER')) {
      return new Response(JSON.stringify({ message: 'Acesso negado. Apenas organizadores ou administradores podem editar eventos.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    
    const { eventId, title, description, date, availableSlots, eventType, location, locationUrl, bannerUrl, logoUrl, trailerUrl, categories, batches, contractText, contractPdf, hasKit, kitSizes, adminFeeRate, registrationOpensAt } = body;

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

    if (!eventId || !title || !date || !availableSlots) {
      return new Response(JSON.stringify({ message: 'ID, título, data e limite de vagas são obrigatórios.' }), {
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

    const isAdmin = user.role === 'ADMIN' || user.email === 'nossainscricao@gmail.com';

    // Validar tenant
    if (!isAdmin && user.role === 'ORGANIZER' && event.tenantId !== user.tenantId) {
      return new Response(JSON.stringify({ message: 'Acesso negado. Você só pode editar eventos da sua organização.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validar status DRAFT ou REJECTED (se não for super admin)
    if (!isAdmin && event.status !== 'DRAFT' && event.status !== 'REJECTED') {
      return new Response(JSON.stringify({ message: 'Acesso negado. Eventos aprovados não podem ser editados por organizadores.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Determinar status final do evento (se admin estiver editando evento publicado, mantém PUBLISHED)
    const targetStatus = (isAdmin && event.status === 'PUBLISHED') ? 'PUBLISHED' : 'DRAFT';

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
      // 1. Atualizar dados básicos do evento
      await tx.event.update({
        where: { id: eventId },
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
          contractText: contractText || null,
          contractPdf: contractPdf || null,
          status: targetStatus,
          rejectionReason: null,
          rejectedAt: null,
        },
      });

      // 2. Tratar categorias e lotes preservando integridade referencial se houver inscrições
      const existingRegistrations = await tx.registration.findMany({
        where: { eventId },
        select: { categoryId: true, batchId: true },
      });

      const usedCategoryIds = new Set(existingRegistrations.map((r) => r.categoryId));
      const usedBatchIds = new Set(existingRegistrations.map((r) => r.batchId));

      if (existingRegistrations.length === 0) {
        // Sem inscrições existentes: recriação total segura
        await tx.category.deleteMany({ where: { eventId } });
        await tx.batch.deleteMany({ where: { eventId } });

        for (const cat of categories) {
          const catTotalSlots = Number(cat.slots || cat.totalSlots || availableSlots);
          const createdCategory = await tx.category.create({
            data: {
              eventId,
              tenantId: event.tenantId,
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
                eventId,
                categoryId: createdCategory.id,
                tenantId: event.tenantId,
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
      } else {
        // Existem inscrições: atualizar e proteger registros referenciados
        const currentCategories = await tx.category.findMany({ where: { eventId } });
        const currentBatches = await tx.batch.findMany({ where: { eventId } });

        const incomingCategoryIds = new Set(categories.map((c: any) => c.id).filter(Boolean));

        // Deletar categorias não recebidas que não tenham inscrições
        for (const cat of currentCategories) {
          if (!incomingCategoryIds.has(cat.id) && !usedCategoryIds.has(cat.id)) {
            await tx.category.delete({ where: { id: cat.id } });
          }
        }

        // Atualizar ou criar categorias
        for (const cat of categories) {
          const catTotalSlots = Number(cat.slots || cat.totalSlots || availableSlots);
          let targetCategoryId = cat.id;

          if (cat.id && currentCategories.some((c) => c.id === cat.id)) {
            await tx.category.update({
              where: { id: cat.id },
              data: {
                name: cat.name,
                gender: cat.gender || 'MISTO',
                minAge: cat.minAge ? Number(cat.minAge) : null,
                maxAge: cat.maxAge ? Number(cat.maxAge) : null,
                totalSlots: catTotalSlots,
                availableSlots: catTotalSlots,
              },
            });
          } else {
            const created = await tx.category.create({
              data: {
                name: cat.name,
                gender: cat.gender || 'MISTO',
                minAge: cat.minAge ? Number(cat.minAge) : null,
                maxAge: cat.maxAge ? Number(cat.maxAge) : null,
                price: 0,
                totalSlots: catTotalSlots,
                availableSlots: catTotalSlots,
                tenantId: event.tenantId,
                eventId,
              },
            });
            targetCategoryId = created.id;
          }

          const catBatches = cat.batches && cat.batches.length > 0 ? cat.batches : batches;
          const incomingCatBatchIds = new Set(catBatches.map((b: any) => b.id).filter(Boolean));

          for (let index = 0; index < catBatches.length; index++) {
            const bat = catBatches[index];
            if (bat.id && currentBatches.some((b) => b.id === bat.id)) {
              await tx.batch.update({
                where: { id: bat.id },
                data: {
                  name: bat.name,
                  price: bat.price.toString(),
                  type: bat.type || 'DATE',
                  position: bat.position !== undefined ? Number(bat.position) : index + 1,
                  startDate: bat.startDate ? new Date(bat.startDate) : null,
                  endDate: bat.endDate ? new Date(bat.endDate) : null,
                  maxQuantity: bat.maxQuantity !== undefined && bat.maxQuantity !== null && bat.maxQuantity !== '' ? Number(bat.maxQuantity) : null,
                  categoryId: targetCategoryId,
                },
              });
            } else {
              await tx.batch.create({
                data: {
                  name: bat.name,
                  price: bat.price.toString(),
                  type: bat.type || 'DATE',
                  position: bat.position !== undefined ? Number(bat.position) : index + 1,
                  startDate: bat.startDate ? new Date(bat.startDate) : null,
                  endDate: bat.endDate ? new Date(bat.endDate) : null,
                  maxQuantity: bat.maxQuantity !== undefined && bat.maxQuantity !== null && bat.maxQuantity !== '' ? Number(bat.maxQuantity) : null,
                  soldQuantity: 0,
                  active: index === 0,
                  tenantId: event.tenantId,
                  eventId,
                  categoryId: targetCategoryId,
                },
              });
            }
          }
        }

        // Deletar lotes não recebidos que não tenham inscrições
        const allIncomingBatchIds = new Set<string>();
        for (const cat of categories) {
          const cBatches = cat.batches && cat.batches.length > 0 ? cat.batches : batches;
          for (const b of cBatches) {
            if (b.id) allIncomingBatchIds.add(b.id);
          }
        }
        for (const bat of currentBatches) {
          if (!allIncomingBatchIds.has(bat.id) && !usedBatchIds.has(bat.id)) {
            await tx.batch.delete({ where: { id: bat.id } });
          }
        }
      }
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
