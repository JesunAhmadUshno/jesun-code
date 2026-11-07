import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Served under the product site at /jesun-code/dashboard/. The page imports
// src/data.json (written by scripts/data.mjs from repo files) and jesun.py /
// jesun.jc with ?raw from the repo root, so every number is generated, never typed.
export default defineConfig({
  base: '/jesun-code/dashboard/',
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
});
