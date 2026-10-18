// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import clerk from '@clerk/astro';
import { ptBR } from '@clerk/localizations';

import { fileURLToPath } from 'node:url';

// https://astro.build/config
export default defineConfig({
  site: 'https://nossainscricao.com.br',
  output: 'server',
  adapter: vercel(),
  integrations: [
    react(),
    clerk({
      localization: /** @type {any} */ (ptBR),
    }),
  ],
  vite: {
    envDir: '../../',
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': '/src',
        'react/jsx-dev-runtime': fileURLToPath(new URL('./src/shims/react-jsx-dev-runtime.ts', import.meta.url)),
      },
    },
    optimizeDeps: {
      exclude: ['react/jsx-dev-runtime'],
    },
  },
});
