import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// base './' so the build works from any static path (GitHub Pages, Netlify).
export default defineConfig({ plugins: [react()], base: './' });
