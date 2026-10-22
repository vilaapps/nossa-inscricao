/**
 * Sanitiza e extrai URL de embed do Google Maps.
 * Aceita:
 * - Tag <iframe> completa (<iframe src="https://www.google.com/maps/embed?..." ...></iframe>)
 * - URL direta de embed (https://www.google.com/maps/embed?...)
 * - URLs de mapas (https://maps.google.com/..., https://www.google.com/maps/...)
 * Retorna a URL limpa para uso em <iframe src="..."> ou null se vazio/inválido.
 */
export function sanitizeGoogleMapsEmbedUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Se o usuário colou uma tag <iframe> (completa ou parcial contendo src)
  const iframeMatch = trimmed.match(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/i);
  if (iframeMatch && iframeMatch[1]) {
    const extracted = iframeMatch[1].trim();
    if (extracted.startsWith('//')) {
      return `https:${extracted}`;
    }
    return extracted;
  }

  // Se for uma tag HTML sem src válido ou string truncada de HTML
  if (trimmed.startsWith('<')) {
    return null;
  }

  // Se já for uma URL (http/https ou protocol-relative)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  return null;
}

/**
 * Sanitiza e extrai URL de embed do YouTube.
 * Aceita:
 * - Tag <iframe> completa (<iframe src="https://www.youtube.com/embed/..." ...></iframe>)
 * - URL de embed direta (https://www.youtube.com/embed/VIDEO_ID)
 * - URL padrão de watch (https://www.youtube.com/watch?v=VIDEO_ID)
 * - URL curta de compartilhamento (https://youtu.be/VIDEO_ID)
 * - URL de shorts (https://www.youtube.com/shorts/VIDEO_ID)
 * Retorna sempre 'https://www.youtube.com/embed/{VIDEO_ID}' quando um ID é identificado,
 * ou a URL sanitizada se válida, ou null se vazio/inválido.
 */
export function sanitizeYouTubeEmbedUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let target = input.trim();
  if (!target) return null;

  // Se o usuário colou a tag <iframe> inteira ou parcial
  const iframeMatch = target.match(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/i);
  if (iframeMatch && iframeMatch[1]) {
    target = iframeMatch[1].trim();
  } else if (target.startsWith('<')) {
    // Tag HTML sem src detectado
    return null;
  }

  // Se for protocol-relative
  if (target.startsWith('//')) {
    target = `https:${target}`;
  }

  // Extrair ID do YouTube (11 caracteres alfanuméricos, hífen ou underline)
  const embedMatch = target.match(/youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/i);
  if (embedMatch && embedMatch[1]) {
    return `https://www.youtube.com/embed/${embedMatch[1]}`;
  }

  const watchMatch = target.match(/youtube(?:-nocookie)?\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})/i);
  if (watchMatch && watchMatch[1]) {
    return `https://www.youtube.com/embed/${watchMatch[1]}`;
  }

  const shortMatch = target.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);
  if (shortMatch && shortMatch[1]) {
    return `https://www.youtube.com/embed/${shortMatch[1]}`;
  }

  const shortsMatch = target.match(/youtube(?:-nocookie)?\.com\/shorts\/([a-zA-Z0-9_-]{11})/i);
  if (shortsMatch && shortsMatch[1]) {
    return `https://www.youtube.com/embed/${shortsMatch[1]}`;
  }

  // Se for uma URL http/https genérica de vídeo
  if (target.startsWith('http://') || target.startsWith('https://')) {
    return target;
  }

  return null;
}
