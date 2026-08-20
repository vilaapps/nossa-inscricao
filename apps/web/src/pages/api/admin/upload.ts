import type { APIRoute } from 'astro';
import { supabaseAdmin, SUPABASE_BUCKET_NAME } from '../../../lib/server/supabase-admin';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = locals.auth();
  const userId = auth.userId;

  if (!userId) {
    return new Response(JSON.stringify({ message: 'Não autorizado.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folder = formData.get('folder') as string || 'general'; // ex: 'banners', 'logos'

    if (!file) {
      return new Response(JSON.stringify({ message: 'Nenhum arquivo enviado.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Gerar nome único para o arquivo
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

    // Upload pro Supabase via client admin (bypassa RLS se service_role key configurada)
    const { data, error } = await supabaseAdmin.storage
      .from(SUPABASE_BUCKET_NAME)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('[Upload-Direct] Supabase upload error:', error);
      throw new Error('Falha no Supabase ao fazer upload.');
    }

    // Obter a URL pública da imagem
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from(SUPABASE_BUCKET_NAME)
      .getPublicUrl(fileName);

    return new Response(JSON.stringify({ url: publicUrl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    const errorDetails = err.message || err;
    console.error('[Upload-Direct] Exceção no upload:', errorDetails);
    
    try {
      await prisma.systemLog.create({
        data: {
          source: 'BACKEND_UPLOAD',
          errorData: {
            message: err.message,
            stack: err.stack,
            raw: err
          }
        }
      });
    } catch (logErr) {
      console.error('Falha ao salvar log no DB:', logErr);
    }

    return new Response(JSON.stringify({ message: 'Erro interno ao processar o upload do arquivo. Contate o suporte técnico.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
