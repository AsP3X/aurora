import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: ["demoncore.tail289d2.ts.net", "niklass-macbook-pro-1.tail289d2.ts.net"],
  },
})
