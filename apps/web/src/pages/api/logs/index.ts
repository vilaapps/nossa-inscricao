import type { APIRoute } from 'astro';
import { PrismaClient } from '@prisma/client';

export const POST: APIRoute = async ({ request }) => {
  const prisma = new PrismaClient();
  try {
    const body = await request.json();
    
    // Save to SystemLog table
    await prisma.systemLog.create({
      data: {
        source: 'FRONTEND',
        errorData: body,
      }
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    // Se falhar até para logar, apenas silencie para não quebrar o cliente
    console.error('Falha crítica ao gravar log do frontend:', err);
    return new Response(JSON.stringify({ success: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    await prisma.$disconnect();
  }
};
