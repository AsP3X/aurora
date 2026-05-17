// Human: Mount the Aurora Vite SPA on `#root` with React Strict Mode (double-invokes effects in dev).
// Agent: ENTRYPOINT; READS `#root`; WRAPS App in StrictMode; IMPORTS global CSS.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
