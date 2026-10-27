import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { Logger } from '@nestjs/common';

const corsLogger = new Logger('CORS');

/**
 * Avalia se a origem recebida na requisição HTTP é permitida pela política de CORS.
 */
export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[] = [],
  nodeEnv: string = process.env.NODE_ENV || 'development',
): boolean {
  // 1. Requisições sem origin (mobile nativo, curl, server-to-server)
  if (!origin) {
    return true;
  }

  // 2. Ambiente de desenvolvimento permite qualquer origem
  if (nodeEnv === 'development') {
    return true;
  }

  // 3. Origens configuradas explicitamente em variáveis de ambiente (ex: WEB_URL)
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // 4. Localhost e 127.0.0.1 em qualquer porta
  if (
    /^http:\/\/localhost(:\d+)?$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
  ) {
    return true;
  }

  // 5. Preview deployments e subdomínios da Vercel (*.vercel.app)
  if (origin.endsWith('.vercel.app') || /\.vercel\.app$/.test(origin)) {
    return true;
  }

  // 6. Domínio oficial de produção (com e sem www, http ou https) e subdomínios
  const isProductionDomain =
    origin === 'https://nossainscricao.com.br' ||
    origin === 'https://www.nossainscricao.com.br' ||
    origin === 'http://nossainscricao.com.br' ||
    origin === 'http://www.nossainscricao.com.br' ||
    /\.nossainscricao\.com\.br$/.test(origin);

  if (isProductionDomain) {
    return true;
  }

  return false;
}

/**
 * Cria a configuração de CORS do NestJS com logging preventivo de origens bloqueadas.
 */
export function getCorsOptions(
  webUrlEnv: string | undefined = process.env.WEB_URL,
  nodeEnv: string = process.env.NODE_ENV || 'development',
): CorsOptions {
  const allowedOrigins = webUrlEnv
    ? webUrlEnv.split(',').map((origin) => origin.trim())
    : ['http://localhost:4321'];

  return {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      const allowed = isOriginAllowed(origin, allowedOrigins, nodeEnv);

      if (allowed) {
        callback(null, true);
      } else {
        corsLogger.warn(
          `[CORS] Bloqueada requisição da origem não permitida: "${origin}"`,
        );
        callback(null, false);
      }
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'x-user-id',
    ],
    optionsSuccessStatus: 204,
  };
}
