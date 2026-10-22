import type { APIRoute } from 'astro';
import { PrismaClient } from '@prisma/client';
import { renderReceiptPdf, generateReceiptCode } from '@syncflow/shared';

export const GET: APIRoute = async ({ params, locals, url }) => {
  const auth = locals.auth();
  const userId = auth.userId;

  if (!userId) {
    return new Response(JSON.stringify({ message: 'Não autorizado.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ message: 'ID da inscrição não fornecido.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const prisma = new PrismaClient();

  try {
    const registration = await prisma.registration.findUnique({
      where: { id },
      include: {
        event: true,
        category: true,
        batch: true,
        user: true,
      },
    });

    if (!registration) {
      await prisma.$disconnect();
      return new Response(JSON.stringify({ message: 'Inscrição não encontrada.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Permite que o próprio atleta ou organizadores acessem o comprovante
    if (registration.userId !== userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || (user.role !== 'ORGANIZER' && user.role !== 'ADMIN')) {
        await prisma.$disconnect();
        return new Response(JSON.stringify({ message: 'Acesso negado.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    if (registration.status !== 'CONFIRMED') {
      await prisma.$disconnect();
      return new Response(JSON.stringify({ message: 'Comprovante disponível apenas para inscrições confirmadas.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let receiptCode = registration.receiptCode;
    if (!receiptCode) {
      receiptCode = generateReceiptCode();
      await prisma.registration.update({
        where: { id: registration.id },
        data: { receiptCode },
      });
    }

    await prisma.$disconnect();

    const metadata = (registration.metadata as any) || {};
    const rawShirtSize = metadata.shirtSize || metadata.complementaryData?.shirtSize || null;
    const athleteCpf = (registration.user as any)?.cpf || metadata.cpf || metadata.complementaryData?.cpf || '';

    const origin = url.origin || 'https://syncflow.com';
    const pdfBuffer = await renderReceiptPdf({
      receiptCode,
      eventName: registration.event.title,
      eventDate: registration.event.date,
      eventLocation: registration.event.location,
      athleteName: registration.user?.name || 'Participante',
      athleteCpf,
      athleteBirthDate: registration.athleteBirthDate,
      athleteGender: registration.athleteGender,
      categoryName: registration.category?.name || 'Geral',
      batchName: registration.batch?.name || 'Lote Oficial',
      shirtSize: registration.event.hasKit ? rawShirtSize : null,
      amountPaid: Number(registration.amountPaid || 0),
      verificationUrl: `${origin}/verificar/${receiptCode}`,
      issuedAt: new Date(),
    });

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="comprovante-${receiptCode}.pdf"`,
      },
    });
  } catch (error) {
    await prisma.$disconnect();
    console.error('Erro ao gerar comprovante PDF na rota Astro:', error);
    return new Response(JSON.stringify({ message: 'Erro ao gerar comprovante.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
