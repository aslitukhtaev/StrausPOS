/// <reference types="vite/client" />
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/global.css'
import './styles/ui.css'
import './styles/layout.css'
import App from './App'

// Sensorli ekranda kontekst menyu va sudrab tashlashni o'chirish (kassa terminali)
window.addEventListener('contextmenu', (e) => {
  const t = e.target as HTMLElement | null
  if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) e.preventDefault()
})
window.addEventListener('dragstart', (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
