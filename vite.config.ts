import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url'; // เพิ่มตัวนี้
import { defineConfig, loadEnv } from 'vite';

// จำลอง __dirname สำหรับ ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      // ช่วยให้ Vite จัดการ PDF Library ได้ดีขึ้น
      include: ['pdfjs-dist', 'pdf-lib', '@pdf-lib/fontkit'],
    },
    build: {
      target: 'esnext', // รองรับ Top-level await ของ PDF.js
    },
    server: {
      // HMR settings
      hmr: process.env.DISABLE_HMR !== 'true',
      port: 3000,
      host: '0.0.0.0',
    },
  };
});