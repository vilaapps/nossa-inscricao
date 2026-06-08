import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'test/**'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
    env: {
      NODE_ENV: 'test',
    },
    envFile: '../../.env.test',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@syncflow/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
});
