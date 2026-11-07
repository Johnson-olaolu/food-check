import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Transformers.js ships its own ONNX Runtime WASM files; don't let Vite pre-bundle it.
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
})
