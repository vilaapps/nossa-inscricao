/**
 * Helper client-side para realizar upload seguro via Signed Upload URLs.
 * 
 * Fluxo:
 * 1. Pede ao backend (/api/admin/upload-url) uma URL assinada temporária.
 * 2. Faz o upload direto do browser para o Supabase Storage via PUT.
 * 3. Retorna a URL pública final da imagem.
 */
export async function uploadFileToSupabase(
  file: File,
  folder: 'banners' | 'logos' | 'general' = 'general'
): Promise<string> {
  const clerk = (window as any).Clerk;
  if (!clerk || !clerk.session) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const token = await clerk.session.getToken();

  // Step 1: Obter a Signed Upload URL do backend
  const res = await fetch('/api/admin/upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      filename: file.name,
      folder,
      contentType: file.type,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: 'Erro ao gerar URL de upload.' }));
    throw new Error(errorData.message || 'Falha ao autorizar upload.');
  }

  const { signedUrl, publicUrl } = await res.json();

  // Step 2: Fazer o upload do arquivo diretamente do navegador para o Supabase Storage
  const uploadRes = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error(`Falha ao enviar arquivo (${uploadRes.statusText})`);
  }

  // Step 3: Retornar a URL pública da imagem
  return publicUrl;
}
