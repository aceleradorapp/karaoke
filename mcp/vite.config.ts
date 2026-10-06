import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    ssr: 'src/index.ts',
    outDir: 'dist',
    target: 'node22',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'caraoke-mcp.mjs', format: 'es' } },
  },
  ssr: { noExternal: true },
  test: { environment: 'node' },
});
