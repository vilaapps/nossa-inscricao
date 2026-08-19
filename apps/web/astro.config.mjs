// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import clerk from '@clerk/astro';

// https://astro.build/config
export default defineConfig({
  site: 'https://nossainscricao.com.br',
  output: 'server',
  adapter: vercel(),
  integrations: [
    react(),
    clerk(),
  ],
  vite: {
    envDir: '../../',
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  },
});
