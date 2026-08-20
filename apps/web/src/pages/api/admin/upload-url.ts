import type { APIRoute } from 'astro';
import { supabaseAdmin, SUPABASE_BUCKET_NAME, isServiceRoleConfigured } from '../../../lib/server/supabase-admin';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ALLOWED_FOLDERS = ['banners', 'logos', 'general'];
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
];

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = locals.auth();
  const userId = auth.userId;

  if (!userId) {
    return new Response(JSON.stringify({ message: 'Não autorizado.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!isServiceRoleConfigured) {
    console.error('[Upload-URL] Erro: SUPABASE_SERVICE_ROLE_KEY não configurada no ambiente.');
    return new Response(
      JSON.stringify({
        message:
          'Erro ao efetuar upload de imagens. Contate o suporte técnico.',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const body = await request.json();
    const { filename, folder = 'general', contentType } = body;

    if (!filename || typeof filename !== 'string') {
      return new Response(JSON.stringify({ message: 'Nome do arquivo inválido.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (contentType && !ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return new Response(
        JSON.stringify({
          message: 'Tipo de arquivo não permitido. Use JPG, PNG, WebP ou SVG.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const sanitizedFolder = ALLOWED_FOLDERS.includes(folder) ? folder : 'general';
    const fileExt = filename.split('.').pop()?.toLowerCase() || 'png';
    const cleanExt = ['jpg', 'jpeg', 'png', 'webp', 'svg'].includes(fileExt) ? fileExt : 'png';

    // Gerar caminho do arquivo isolado pelo ID do usuário
    const fileName = `${userId}/${sanitizedFolder}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${cleanExt}`;

    // Gerar a URL Assinada de Upload no Supabase com permissão temporária (ex: 60 segundos)
    const { data, error } = await supabaseAdmin.storage
      .from(SUPABASE_BUCKET_NAME)
      .createSignedUploadUrl(fileName);

    if (error || !data) {
      console.error('[Upload-URL] Falha do Supabase ao criar URL assinada:', error);
      throw new Error(error?.message || 'Falha ao criar URL de upload assinado.');
    }

    // Obter URL pública onde a imagem estará disponível após o upload
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from(SUPABASE_BUCKET_NAME)
      .getPublicUrl(fileName);

    return new Response(
      JSON.stringify({
        signedUrl: data.signedUrl,
        token: data.token,
        path: data.path,
        publicUrl,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    const errorDetails = err.message || err;
    console.error('[Upload-URL] Exceção capturada:', errorDetails);
    
    try {
      await prisma.systemLog.create({
        data: {
          source: 'BACKEND_UPLOAD_URL',
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

    return new Response(
      JSON.stringify({ message: 'Erro interno ao gerar URL de upload. Tente novamente mais tarde.' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
