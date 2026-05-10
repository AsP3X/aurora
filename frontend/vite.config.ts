import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

function formatTimestamp(): string {
  return new Date().toISOString().replace('Z', '000Z')
}

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const BOLD_BLUE = '\x1b[1;34m'

function requestLogger() {
  return {
    name: 'request-logger',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const method = req.method ?? '?'
        const uri = req.url ?? '?'
        const ts = formatTimestamp()
        console.log(
          `${ts} ${BOLD_BLUE}DEBUG${RESET} ` +
          `request{method=${method} uri=${uri} version=HTTP/1.1}: ` +
          `${DIM}tower_http::trace::on_request:${RESET} started processing request`
        )

        const start = Date.now()
        res.on('finish', () => {
          const duration = Date.now() - start
          const status = res.statusCode
          console.log(
            `${ts} ${BOLD_BLUE}DEBUG${RESET} ` +
            `request{method=${method} uri=${uri} version=HTTP/1.1}: ` +
            `${DIM}tower_http::trace::on_response:${RESET} finished processing request latency=${duration} ms status=${status}`
          )
        })
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), requestLogger()],
  server: {
    allowedHosts: ["demoncore.tail289d2.ts.net", "niklass-macbook-pro-1.tail289d2.ts.net"],
  },
})
