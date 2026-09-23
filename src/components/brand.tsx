import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// シンボル：再生三角形を電光の斬撃が断ち切る
export const Logo = ({ size = 36 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#1a73ff" />
        <stop offset="1" stopColor="#3ee0ff" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="16" fill="#04060c" />
    <rect x="1.5" y="1.5" width="61" height="61" rx="14.5" fill="none" stroke="url(#lg)" strokeWidth="3" />
    <path d="M22 16 L48 32 L22 48 Z" fill="url(#lg)" />
    <path d="M40 8 L27 30 L36 30 L24 56 L44 26 L35 26 L46 8 Z" fill="#fff" stroke="#04060c" strokeWidth="2.5" strokeLinejoin="round" />
  </svg>
)

export const Wordmark = () => (
  <span className="font-black italic tracking-tight leading-none inline-flex items-center gap-1.5">
    MATCH<span className="text-cyan">CUT</span>
    <span className="text-[10px] not-italic font-black tracking-widest bg-cyan text-ink rounded px-1.5 py-0.5 align-middle">AI</span>
  </span>
)

// 画面いっぱいに一瞬だけ言葉を叩きつける演出（書き出す動画と同じ世界観）
export function Slam({ word, trigger, sub }: { word: string; trigger: number; sub?: string }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!trigger) return
    setShown(trigger)
    const t = setTimeout(() => setShown(0), 1100)
    return () => clearTimeout(t)
  }, [trigger])
  if (!shown) return null
  return createPortal(
    <div key={shown} className="fixed inset-0 z-[60] pointer-events-none grid place-items-center overflow-hidden">
      <div className="absolute inset-0 bg-white animate-[flash_.35s_ease-out_both]" />
      <div className="absolute -inset-1/2 speedlines animate-[flash_1.1s_ease-out_both]" />
      <div className="text-center animate-[slam_1.1s_cubic-bezier(.2,.8,.2,1)_both]">
        <p className="text-7xl font-black italic text-white [text-shadow:0_0_24px_#1a73ff,4px_0_0_rgba(255,0,90,.7),-4px_0_0_rgba(0,200,255,.8)] [-webkit-text-stroke:2px_#04060c]">{word}</p>
        {sub && <p className="mt-2 text-sm font-bold text-cyan tracking-[0.3em]">{sub}</p>}
      </div>
    </div>,
    document.body,
  )
}
