import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Spike from './Spike.tsx'
import { ensureAac } from './render.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.hash === '#spike' ? <Spike /> : <App />}
  </StrictMode>,
)

// iOSが容量確保のために保存データ（名簿・BGM）を消さないよう、永続化を頼んでおく
navigator.storage?.persist?.().catch(() => {})

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(async () => {
    const reg = await navigator.serviceWorker.ready
    // オフラインで書き出すときに要る予備AACエンコーダも、オンラインのうちに取得しておく
    await ensureAac().catch(() => {})
    const urls = [new URL('./', location.href).href, ...performance.getEntriesByType('resource').map(e => e.name)]
      .filter(u => u.startsWith(location.origin))
    reg.active?.postMessage({ type: 'precache', urls })
  })
}
