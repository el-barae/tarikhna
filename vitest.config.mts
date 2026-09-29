import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: {alias: {'@history/core': path.resolve('packages/core/src/index.ts'), '@': path.resolve('src')}},
  test: {include: ['tests/**/*.test.ts'], exclude: ['tests/**/*.e2e.*'], environment: 'node'}
});
