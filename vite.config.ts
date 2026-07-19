import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    // NOTE: GEMINI_API_KEY is intentionally NOT injected into the client bundle.
    // Inlining it here leaked the key into the public site and got the GCP project
    // hijacked/suspended. Gemini calls now go through the server-side /api/gemini
    // proxy, which holds the key. Do not re-add a `define` for GEMINI_API_KEY.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
