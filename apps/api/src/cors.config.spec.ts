import { isOriginAllowed, getCorsOptions } from './cors.config';
import { Logger } from '@nestjs/common';

describe('CORS Configuration (cors.config)', () => {
  describe('isOriginAllowed', () => {
    it('should allow requests with undefined or empty origin (mobile, curl, server-to-server)', () => {
      expect(isOriginAllowed(undefined, [], 'production')).toBe(true);
      expect(isOriginAllowed('', [], 'production')).toBe(true);
      expect(isOriginAllowed(undefined)).toBe(true);
    });


    it('should allow any origin in development mode', () => {
      expect(isOriginAllowed('https://any-domain.xyz', [], 'development')).toBe(true);
    });

    it('should allow origins configured in allowedOrigins list', () => {
      expect(
        isOriginAllowed(
          'https://custom-partner.com',
          ['https://custom-partner.com'],
          'production',
        ),
      ).toBe(true);
    });

    it('should allow localhost and 127.0.0.1 on any port in production', () => {
      expect(isOriginAllowed('http://localhost', [], 'production')).toBe(true);
      expect(isOriginAllowed('http://localhost:4321', [], 'production')).toBe(true);
      expect(isOriginAllowed('http://localhost:3000', [], 'production')).toBe(true);
      expect(isOriginAllowed('http://127.0.0.1:8080', [], 'production')).toBe(true);
    });

    it('should allow vercel.app subdomains in production', () => {
      expect(isOriginAllowed('https://nossa-inscricao-web.vercel.app', [], 'production')).toBe(true);
      expect(isOriginAllowed('https://preview-abc123.vercel.app', [], 'production')).toBe(true);
    });

    it('should allow production domain nossainscricao.com.br with and without www (https and http)', () => {
      expect(isOriginAllowed('https://nossainscricao.com.br', [], 'production')).toBe(true);
      expect(isOriginAllowed('https://www.nossainscricao.com.br', [], 'production')).toBe(true);
      expect(isOriginAllowed('http://nossainscricao.com.br', [], 'production')).toBe(true);
      expect(isOriginAllowed('http://www.nossainscricao.com.br', [], 'production')).toBe(true);
      expect(isOriginAllowed('https://app.nossainscricao.com.br', [], 'production')).toBe(true);
    });

    it('should reject unauthorized external origins in production', () => {
      expect(isOriginAllowed('https://malicious-site.com', [], 'production')).toBe(false);
      expect(isOriginAllowed('https://fake-nossainscricao.com', [], 'production')).toBe(false);
    });
  });

  describe('getCorsOptions', () => {
    it('should configure CORS options with correct defaults and credentials', () => {
      const options = getCorsOptions();

      expect(options.credentials).toBe(true);
      expect(options.methods).toBe('GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
      expect(options.optionsSuccessStatus).toBe(204);
      expect(options.allowedHeaders).toContain('Authorization');
      expect(options.allowedHeaders).toContain('Content-Type');
    });

    it('should execute origin callback returning true for allowed origin', (done) => {
      const options = getCorsOptions('https://custom.com', 'production');
      const originCallback = options.origin as (
        origin: string | undefined,
        cb: (err: Error | null, allow?: boolean) => void,
      ) => void;

      originCallback('https://nossainscricao.com.br', (err, allow) => {
        expect(err).toBeNull();
        expect(allow).toBe(true);
        done();
      });
    });

    it('should execute origin callback returning false and log warning for disallowed origin', (done) => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      const options = getCorsOptions(undefined, 'production');
      const originCallback = options.origin as (
        origin: string | undefined,
        cb: (err: Error | null, allow?: boolean) => void,
      ) => void;

      originCallback('https://unauthorized-domain.com', (err, allow) => {
        expect(err).toBeNull();
        expect(allow).toBe(false);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('https://unauthorized-domain.com'),
        );
        warnSpy.mockRestore();
        done();
      });
    });
  });
});
