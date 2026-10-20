import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environmentMatchGlobs: [['tests/ui/**', 'jsdom']],
    setupFiles: ['tests/ui/setup.ts'],
    // Whole-week UI suites click through every screen in jsdom and can exceed the 5 s default on a busy machine.
    testTimeout: 15000,
  },
});
