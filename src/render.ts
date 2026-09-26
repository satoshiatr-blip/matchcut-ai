import {
  ALL_FORMATS, AudioBufferSource, AudioSampleSink, BlobSource, BufferTarget, CanvasSink, CanvasSource,
  Input, Mp4OutputFormat, Output, QUALITY_HIGH, canEncodeAudio, canEncodeVideo,
} from 'mediabunny'
import type { Player, Project, Scene, ZoomRect } from './types'
import { impact, riser, slowDown, whoosh } from './sfx'

export const OUT_W = 1920
export const OUT_H = 1080
export const FPS = 30
export const SLOW_RATE = 0.5
const OPEN_SEC = 3
const CLOSE_SEC = 3
const SAMPLE_RATE = 48000
const FONT = '-apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif'

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2)

// ---- シーンの時間計算（元動画の秒 ⇔ 出力の秒） ----

export function slowRange(s: Scene): [number, number] | null {
  if (!s.slow) return null
  const a = clamp(s.slowAt, s.start, s.end)
  const b = clamp(s.slowAt + s.slowLen, s.start, s.end)
  return b - a > 0.05 ? [a, b] : null
}

export function sceneOutDuration(s: Scene) {
  const r = slowRange(s)
  const len = s.end - s.start
  return r ? len + (r[1] - r[0]) * (1 / SLOW_RATE - 1) : len
}

export function srcTimeAt(s: Scene, tOut: number) {
  const r = slowRange(s)
  if (!r) return s.start + tOut
  const a = r[0] - s.start
  const slowOut = (r[1] - r[0]) / SLOW_RATE
  if (tOut < a) return s.start + tOut
  if (tOut < a + slowOut) return r[0] + (tOut - a) * SLOW_RATE
  return r[1] + (tOut - a - slowOut)
}

export function outTimeAt(s: Scene, src: number) {
  const r = slowRange(s)
  if (!r || src < r[0]) return src - s.start
  const a = r[0] - s.start
  if (src < r[1]) return a + (src - r[0]) / SLOW_RATE
  return a + (r[1] - r[0]) / SLOW_RATE + (src - r[1])
}

export const isSlowAt = (s: Scene, src: number) => {
  const r = slowRange(s)
  return !!r && src >= r[0] && src < r[1]
}

export function zoomAt(s: Scene, u: number): ZoomRect {
  const k = ease(clamp(u, 0, 1))
  return {
    cx: s.zoomFrom.cx + (s.zoomTo.cx - s.zoomFrom.cx) * k,
    cy: s.zoomFrom.cy + (s.zoomTo.cy - s.zoomFrom.cy) * k,
    scale: s.zoomFrom.scale + (s.zoomTo.scale - s.zoomFrom.scale) * k,
  }
}

export function cropRect(z: ZoomRect, w: number, h: number) {
  const sw = w / z.scale
  const sh = h / z.scale
  const sx = clamp(z.cx * w - sw / 2, 0, w - sw)
  const sy = clamp(z.cy * h - sh / 2, 0, h - sh)
  return { sx, sy, sw, sh }
}

// ---- 描画（座標は常に 1920x1080 基準。プレビューは setTransform で縮小） ----

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export type DrawInfo = { project: Project; scene: Scene; player: Player | null; tOut: number; dur: number; src: number }

const INK = '#04060c'
const CYAN = '#3ee0ff'
const SLASH_SEC = 0.3
const KIND_BIG: Record<Scene['kind'], string> = { goal: 'GOAL', save: 'SAVE', play: 'NICE PLAY' }

// フレーム番号から決まる疑似乱数（プレビューと書き出しで同じ揺れにする）
const rnd = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x) }

let grain: CanvasPattern | null = null
function grainPattern(ctx: Ctx) {
  if (grain) return grain
  const c = new OffscreenCanvas(256, 256)
  const g = c.getContext('2d')!
  const d = g.createImageData(256, 256)
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.random() * 255
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v
    d.data[i + 3] = 255
  }
  g.putImageData(d, 0, 0)
  grain = ctx.createPattern(c, 'repeat')
  return grain
}

export function drawScene(ctx: Ctx, img: CanvasImageSource, w: number, h: number, info: DrawInfo) {
  const { project, scene, tOut, dur, src } = info
  const accent = project.color
  const frame = Math.round(tOut * FPS)
  const dt = tOut - outTimeAt(scene, scene.mark)
  const z = zoomAt(scene, tOut / dur)
  const punch = dt >= 0 ? 1 + 0.07 * Math.exp(-dt * 5) : 1
  const { sx, sy, sw, sh } = cropRect({ ...z, scale: z.scale * punch }, w, h)

  ctx.save()
  if (project.grade && 'filter' in ctx) ctx.filter = 'contrast(1.18) saturate(1.1)'
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H)
  if ('filter' in ctx) ctx.filter = 'none'
  ctx.restore()

  if (project.grade) {
    ctx.save()
    ctx.globalCompositeOperation = 'soft-light'
    ctx.fillStyle = 'rgba(20,60,160,0.45)'
    ctx.fillRect(0, 0, OUT_W, OUT_H)
    ctx.restore()
  }
  const slow = isSlowAt(scene, src)
  if (slow) {
    ctx.save()
    ctx.globalCompositeOperation = 'saturation'
    ctx.fillStyle = 'rgba(128,128,128,0.35)'
    ctx.fillRect(0, 0, OUT_W, OUT_H)
    ctx.restore()
  }
  drawVignette(ctx, slow ? 0.6 : 0.45)
  drawGrain(ctx, frame)
  if (slow) drawSlowFx(ctx, scene, src, frame)
  drawCorner(ctx, project)
  if (project.showNames) drawPlate(ctx, info, accent)
  if (dt >= 0 && dt < 1.7) drawSlam(ctx, KIND_BIG[scene.kind], dt, accent)
  if (dt >= 0 && dt < 0.1) {
    ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - dt / 0.1)})`
    ctx.fillRect(0, 0, OUT_W, OUT_H)
  }
  if (tOut < SLASH_SEC) drawSlash(ctx, accent, tOut / SLASH_SEC, frame)
  else if (dur - tOut < SLASH_SEC) drawSlash(ctx, accent, -(dur - tOut) / SLASH_SEC, frame)
}

function drawVignette(ctx: Ctx, strength: number) {
  const g = ctx.createRadialGradient(OUT_W / 2, OUT_H / 2, OUT_H * 0.35, OUT_W / 2, OUT_H / 2, OUT_H * 1.0)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, `rgba(0,0,8,${strength})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, OUT_W, OUT_H)
}

function drawGrain(ctx: Ctx, frame: number) {
  ctx.save()
  ctx.globalAlpha = 0.07
  ctx.globalCompositeOperation = 'overlay'
  ctx.translate(-rnd(frame) * 256, -rnd(frame + 3) * 256)
  ctx.fillStyle = grainPattern(ctx)!
  ctx.fillRect(0, 0, OUT_W + 256, OUT_H + 256)
  ctx.restore()
}

function speedLines(ctx: Ctx, cx: number, cy: number, frame: number, count: number, inner: number, color: string, alpha: number) {
  ctx.save()
  ctx.strokeStyle = color
  for (let i = 0; i < count; i++) {
    const a = rnd(i * 3.1 + Math.floor(frame / 2) * 0.37) * Math.PI * 2
    const r0 = inner + rnd(i + frame) * 200
    ctx.globalAlpha = alpha * (0.4 + rnd(i * 1.7) * 0.6)
    ctx.lineWidth = 2 + rnd(i * 5.3) * 6
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
    ctx.lineTo(cx + Math.cos(a) * 2400, cy + Math.sin(a) * 2400)
    ctx.stroke()
  }
  ctx.restore()
}

function drawSlowFx(ctx: Ctx, scene: Scene, src: number, frame: number) {
  const r = slowRange(scene)!
  const k = ease(clamp((src - r[0]) / 0.15, 0, 1)) * ease(clamp((r[1] - src) / 0.15, 0, 1))
  speedLines(ctx, OUT_W / 2, OUT_H / 2, frame, 40, 820, '#ffffff', 0.18 * k)
  const bar = 120 * k
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, OUT_W, bar)
  ctx.fillRect(0, OUT_H - bar, OUT_W, bar)
  if (k < 0.5) return
  ctx.save()
  ctx.globalAlpha = (k - 0.5) * 2
  ctx.fillStyle = CYAN
  ctx.fillRect(70, 52, 8, 34)
  ctx.font = `italic 800 32px ${FONT}`
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  const x = spaced(ctx, 'SLOW MOTION', 96, 70, 6)
  ctx.fillStyle = CYAN
  ctx.fillText('×0.5', x + 18, 70)
  ctx.restore()
}

function spacedWidth(ctx: Ctx, text: string, gap: number) {
  let w = 0
  for (const ch of text) w += ctx.measureText(ch).width + gap
  return w - gap
}

// #rrggbb を rgba() に変換する（カラーピッカーの色をグラデーション等で半透明にするため）
function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

function spaced(ctx: Ctx, text: string, x: number, y: number, gap: number) {
  for (const ch of text) {
    ctx.fillText(ch, x, y)
    x += ctx.measureText(ch).width + gap
  }
  return x
}

function drawCorner(ctx: Ctx, p: Project) {
  if (!p.title && !p.opponent) return
  ctx.save()
  ctx.textBaseline = 'middle'
  const x = OUT_W - 70, y = OUT_H - 70
  ctx.textAlign = 'right'
  ctx.globalAlpha = 0.85
  ctx.fillStyle = '#fff'
  ctx.font = `700 26px ${FONT}`
  ctx.fillText(p.title, x, y - 34)
  ctx.fillStyle = CYAN
  ctx.font = `italic 800 26px ${FONT}`
  if (p.opponent) ctx.fillText(`VS ${p.opponent}`, x, y)
  ctx.fillStyle = CYAN
  ctx.fillRect(x + 16, y - 50, 5, 66)
  ctx.restore()
}

// 左下の選手プレート：大きな背番号＋黒い斜めの板に名前
function drawPlate(ctx: Ctx, { scene, player, tOut, dur }: DrawInfo, accent: string) {
  const inT = 0.45
  if (tOut < inT) return
  const k = ease(clamp((tOut - inT) / 0.35, 0, 1))
  const alpha = clamp((dur - SLASH_SEC - tOut) / 0.25, 0, 1)
  if (alpha <= 0) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(-(1 - k) * 900, 0)
  const base = OUT_H - 120
  const x = 80
  let nx = x
  ctx.textBaseline = 'alphabetic'
  if (player?.number) {
    ctx.save()
    ctx.translate(x, base + 20)
    ctx.transform(1, 0, -0.22, 1, 0, 0)
    ctx.font = `italic 900 190px ${FONT}`
    const num = player.number.padStart(2, '0')
    ctx.lineWidth = 5
    ctx.strokeStyle = CYAN
    ctx.shadowColor = accent
    ctx.shadowBlur = 24
    ctx.strokeText(num, 0, 0)
    ctx.shadowBlur = 0
    ctx.fillStyle = 'rgba(62,224,255,0.12)'
    ctx.fillText(num, 0, 0)
    nx = x + ctx.measureText(num).width + 10
    ctx.restore()
  }
  const label = { goal: 'GOAL', save: 'NICE SAVE', play: 'NICE PLAY' }[scene.kind]
  ctx.font = `800 64px ${FONT}`
  const name = player?.name ?? ''
  const pw = Math.max(ctx.measureText(name).width + 110, 360)
  const py = base - 96
  ctx.fillStyle = 'rgba(4,6,12,0.88)'
  slanted(ctx, nx, py, pw, 100, 26)
  ctx.save()
  ctx.shadowColor = accent
  ctx.shadowBlur = 18
  ctx.fillStyle = CYAN
  slanted(ctx, nx - 6, py + 100, pw + 6, 7, 2)
  ctx.restore()
  ctx.fillStyle = accent
  slanted(ctx, nx + 18, py - 46, 250, 42, 11)
  ctx.fillStyle = '#fff'
  ctx.font = `italic 900 30px ${FONT}`
  ctx.textBaseline = 'middle'
  spaced(ctx, label, nx + 40, py - 24, 4)
  if (name) {
    ctx.font = `800 64px ${FONT}`
    ctx.fillStyle = '#fff'
    ctx.fillText(name, nx + 50, py + 52)
  }
  ctx.restore()
}

// 決定的瞬間に叩きつけるワード（単色＋差し色1本のミニマル構成。海外ハイライトのロワーサード傾向に合わせグリッチ二重像は廃止）
function drawSlam(ctx: Ctx, word: string, dt: number, accent: string) {
  const inK = ease(clamp(dt / 0.14, 0, 1))
  const out = clamp((1.7 - dt) / 0.35, 0, 1)
  const scale = 1.5 - 0.5 * inK
  ctx.save()
  ctx.globalAlpha = out
  // 中央だと選手が隠れるので右上（空・背景側）に置く。ポップイン時の1.5倍スケールでも上端が切れない余白を確保
  ctx.translate(OUT_W - 90, 260)
  ctx.rotate(-0.04)
  ctx.scale(scale, scale)
  ctx.transform(1, 0, -0.16, 1, 0, 0)
  ctx.font = `italic 900 ${word.length > 5 ? 120 : 160}px ${FONT}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 14
  ctx.strokeStyle = INK
  ctx.shadowColor = accent
  ctx.shadowBlur = 32
  ctx.strokeText(word, 0, 0)
  ctx.shadowBlur = 0
  ctx.fillStyle = '#fff'
  ctx.fillText(word, 0, 0)
  // 差し色の細い一本線（海外の最小構成ロワーサードに寄せたアクセント）
  const w = ctx.measureText(word).width
  ctx.fillStyle = accent
  ctx.fillRect(-w - 4, 28, w + 4, 6)
  ctx.restore()
}

// 場面転換：ギザギザの黒い斬撃がシアンの光をまとって横切る。p: -1→0 で覆い、0→1 で抜ける
function drawSlash(ctx: Ctx, accent: string, p: number, frame: number) {
  const span = OUT_W + 1100
  ctx.save()
  ctx.translate(p * span, 0)
  const path = (x0: number, x1: number) => {
    ctx.beginPath()
    ctx.moveTo(x0 + 550, 0)
    ctx.lineTo(x1 + 550, 0)
    const n = 9
    for (let i = 1; i <= n; i++) ctx.lineTo(x1 + 550 - (550 * i) / n + (i % 2 ? 40 : -40), (OUT_H * i) / n)
    ctx.lineTo(x0, OUT_H)
    for (let i = n - 1; i >= 1; i--) ctx.lineTo(x0 + (550 * (n - i)) / n + (i % 2 ? -40 : 40), (OUT_H * i) / n)
    ctx.closePath()
  }
  ctx.fillStyle = INK
  path(-550, OUT_W + 550)
  ctx.fill()
  ctx.shadowColor = accent
  ctx.shadowBlur = 30
  ctx.strokeStyle = CYAN
  ctx.lineWidth = 8
  ctx.stroke()
  ctx.shadowBlur = 0
  speedLines(ctx, OUT_W / 2, OUT_H / 2, frame, 24, 300, accent, 0.35)
  ctx.restore()
  if (Math.abs(p) < 0.12) {
    ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - Math.abs(p) / 0.12)})`
    ctx.fillRect(0, 0, OUT_W, OUT_H)
  }
}

function slanted(ctx: Ctx, x: number, y: number, w: number, h: number, s: number) {
  ctx.beginPath()
  ctx.moveTo(x + s, y)
  ctx.lineTo(x + w + s, y)
  ctx.lineTo(x + w - s, y + h)
  ctx.lineTo(x - s, y + h)
  ctx.closePath()
  ctx.fill()
}

export function drawCard(ctx: Ctx, p: Project, kind: 'open' | 'close', t: number, dur: number) {
  const accent = p.color
  const frame = Math.round(t * FPS)
  const cx = OUT_W / 2
  const cy = OUT_H / 2

  // 背景：静かなグラデーションと控えめな光だけ。集中線や幽霊文字は使わない
  const bg = ctx.createLinearGradient(0, 0, OUT_W, OUT_H)
  bg.addColorStop(0, '#05070f')
  bg.addColorStop(1, '#0b1226')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, OUT_W, OUT_H)
  const glow = ctx.createRadialGradient(cx, OUT_H * 0.4, 0, cx, OUT_H * 0.4, OUT_W * 0.55)
  glow.addColorStop(0, withAlpha(accent, 0.22))
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, OUT_W, OUT_H)
  drawVignette(ctx, 0.55)

  const reveal = ease(clamp(t / 0.5, 0, 1))
  const rise = (1 - reveal) * 18

  // ケッカー：字間を空けた小さな英字ラベル＋細い一本線
  const kicker = kind === 'open' ? 'MATCH HIGHLIGHTS' : 'THANK YOU'
  ctx.save()
  ctx.globalAlpha = reveal
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 25px ${FONT}`
  ctx.fillStyle = CYAN
  const kickerY = cy - 218 + rise
  const kw = spacedWidth(ctx, kicker, 9)
  spaced(ctx, kicker, cx - kw / 2, kickerY, 9)
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(cx - 54, kickerY + 26)
  ctx.lineTo(cx + 54, kickerY + 26)
  ctx.stroke()
  ctx.restore()

  // メインタイトル：グリッチや傾きをやめ、静かにスケール＋フェードで見せる
  const main = kind === 'open' ? (p.title || 'HIGHLIGHTS') : (p.team || 'HIGHLIGHTS')
  const titleK = ease(clamp((t - 0.12) / 0.45, 0, 1))
  ctx.save()
  ctx.globalAlpha = titleK
  ctx.translate(cx, cy - 38 + (1 - titleK) * 14)
  ctx.scale(0.97 + 0.03 * titleK, 0.97 + 0.03 * titleK)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `800 ${main.length > 10 ? 88 : 116}px ${FONT}`
  ctx.shadowColor = accent
  ctx.shadowBlur = 34
  ctx.fillStyle = '#fff'
  ctx.fillText(main, 0, 0)
  ctx.shadowBlur = 0
  ctx.restore()

  // タイトル下の細いアンダーライン（アクセントカラーのグラデーション）
  ctx.save()
  ctx.globalAlpha = titleK
  const lineW = 130 * titleK
  const ug = ctx.createLinearGradient(cx - lineW, 0, cx + lineW, 0)
  ug.addColorStop(0, 'rgba(255,255,255,0)')
  ug.addColorStop(0.5, accent)
  ug.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = ug
  ctx.fillRect(cx - lineW, cy + 26, lineW * 2, 3)
  ctx.restore()

  // サブ：チーム・対戦相手、控えめな一行
  const subK = ease(clamp((t - 0.32) / 0.35, 0, 1))
  const sub = kind === 'open' ? [p.team, p.opponent].filter(Boolean).join('   ·   ') : ''
  if (sub) {
    ctx.save()
    ctx.globalAlpha = subK
    ctx.textAlign = 'center'
    ctx.font = `600 33px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    ctx.fillText(sub, cx, cy + 76)
    ctx.restore()
  }
  if (p.date) {
    ctx.save()
    ctx.globalAlpha = subK * 0.75
    ctx.textAlign = 'center'
    ctx.font = `500 24px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    const dy = sub ? cy + 118 : cy + 76
    const dtext = p.date.replaceAll('-', '.')
    const dw = spacedWidth(ctx, dtext, 4)
    ctx.textAlign = 'left'
    spaced(ctx, dtext, cx - dw / 2, dy, 4)
    ctx.restore()
  }

  drawGrain(ctx, frame)
  if (t < 0.08) {
    ctx.fillStyle = `rgba(255,255,255,${1 - t / 0.08})`
    ctx.fillRect(0, 0, OUT_W, OUT_H)
  }
  if (kind === 'open' && dur - t < SLASH_SEC) drawSlash(ctx, accent, -(dur - t) / SLASH_SEC, frame)
  if (kind === 'close') {
    if (t < SLASH_SEC) drawSlash(ctx, accent, t / SLASH_SEC, frame)
    if (dur - t < 0.6) {
      ctx.fillStyle = `rgba(0,0,0,${1 - (dur - t) / 0.6})`
      ctx.fillRect(0, 0, OUT_W, OUT_H)
    }
  }
}

// ---- 書き出し ----

let aacReady: Promise<void> | null = null
// Safari が AAC を書き出せない場合だけ WASM 版エンコーダを読み込む
export function ensureAac() {
  aacReady ??= (async () => {
    if (await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: SAMPLE_RATE })) return
    const { registerAacEncoder } = await import('@mediabunny/aac-encoder')
    registerAacEncoder()
  })()
  return aacReady
}

export function totalDuration(scenes: Scene[]) {
  return OPEN_SEC + CLOSE_SEC + scenes.reduce((a, s) => a + sceneOutDuration(s), 0)
}

type ExportOpts = {
  project: Project
  files: Map<string, File>
  bgm: File | null
  comment: File | null
  onProgress: (p: number, label: string) => void
  signal: AbortSignal
}

const COMMENT_MAX = 20

async function probeComment(file: File) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  const vTrack = await input.getPrimaryVideoTrack()
  if (!vTrack) { input.dispose(); return null }
  const aTrack = await input.getPrimaryAudioTrack()
  const dur = Math.min(await input.computeDuration(), COMMENT_MAX)
  return { input, vTrack, aTrack, dur }
}

// ラストの本人コメント区間：映像はそのまま、左下に控えめなラベルだけ添える
function drawComment(ctx: Ctx, img: CanvasImageSource, t: number, dur: number) {
  ctx.drawImage(img, 0, 0, OUT_W, OUT_H)
  drawVignette(ctx, 0.35)
  const a = Math.min(ease(clamp(t / 0.4, 0, 1)), ease(clamp((dur - t) / 0.4, 0, 1)))
  ctx.save()
  ctx.globalAlpha = a
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 25px ${FONT}`
  ctx.fillStyle = CYAN
  const y = OUT_H - 70
  const w = spacedWidth(ctx, 'FROM THE PLAYER', 9)
  spaced(ctx, 'FROM THE PLAYER', 70, y, 9)
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(70, y + 16)
  ctx.lineTo(70 + w, y + 16)
  ctx.stroke()
  ctx.restore()
}

export async function exportHighlight({ project, files, bgm, comment, onProgress, signal }: ExportOpts): Promise<File> {
  const scenes = project.scenes
  const inputs = new Map<string, Input>()
  const getInput = (key: string) => {
    let inp = inputs.get(key)
    if (!inp) {
      const f = files.get(key)
      if (!f) throw new Error('動画ファイルが読み込まれていません')
      inp = new Input({ source: new BlobSource(f), formats: ALL_FORMATS })
      inputs.set(key, inp)
    }
    return inp
  }
  const commentInfo = comment ? await probeComment(comment) : null

  try {
    if (!(await canEncodeVideo('avc', { width: OUT_W, height: OUT_H })))
      throw new Error('この端末のブラウザは動画の書き出し（H.264）に対応していません。iOSを最新にしてお試しください')
    await ensureAac()
    const total = totalDuration(scenes) + (commentInfo?.dur ?? 0)
    onProgress(0, '音声を準備中')
    const audio = await renderAudio(project, getInput, bgm, total, commentInfo)

    const canvas = new OffscreenCanvas(OUT_W, OUT_H)
    const ctx = canvas.getContext('2d')!
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
    const video = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH })
    output.addVideoTrack(video, { frameRate: FPS })
    const audioSrc = new AudioBufferSource({ codec: 'aac', bitrate: QUALITY_HIGH })
    output.addAudioTrack(audioSrc)
    await output.start()

    const totalFrames = Math.round(total * FPS)
    let frame = 0
    const emit = async () => {
      if (signal.aborted) throw new DOMException('中止しました', 'AbortError')
      await video.add(frame / FPS, 1 / FPS)
      frame++
      if (frame % 10 === 0) onProgress(frame / totalFrames, `映像を書き出し中 ${Math.round((frame / totalFrames) * 100)}%`)
    }

    for (let i = 0; i < OPEN_SEC * FPS; i++) {
      drawCard(ctx, project, 'open', i / FPS, OPEN_SEC)
      await emit()
    }
    const sinks = new Map<string, CanvasSink>()
    for (const scene of scenes) {
      const vTrack = await getInput(scene.sourceKey).getPrimaryVideoTrack()
      if (!vTrack) throw new Error('映像トラックがありません')
      if (!(await vTrack.canDecode())) throw new Error(`この端末のブラウザでは、この動画の形式（${vTrack.codec === 'hevc' ? 'HEVC（高効率）' : String(vTrack.codec ?? '不明')}）を読み込めません。iOSを最新にするか、iPhoneの「設定」→「カメラ」→「フォーマット」を「互換性優先」にして撮った動画でお試しください`)
      // 4K（iPhoneの標準設定）はそのままだとメモリを多く使うので、ズームしても荒れにくい 2560px までに縮めて取り出す
      const dw = await vTrack.getDisplayWidth()
      const dh = await vTrack.getDisplayHeight()
      const k0 = Math.min(1, 2560 / Math.max(dw, dh))
      const w = Math.round(dw * k0), h = Math.round(dh * k0)
      let sink = sinks.get(scene.sourceKey)
      if (!sink) {
        sink = new CanvasSink(vTrack, { poolSize: 2, width: w, height: h, fit: 'fill' })
        sinks.set(scene.sourceKey, sink)
      }
      const dur = sceneOutDuration(scene)
      const n = Math.round(dur * FPS)
      const times = Array.from({ length: n }, (_, k) => srcTimeAt(scene, k / FPS))
      const player = project.showNames ? (project.players.find(p => p.id === scene.playerId) ?? null) : null
      let k = 0
      for await (const wc of sink.canvasesAtTimestamps(times)) {
        if (wc) drawScene(ctx, wc.canvas, w, h, { project, scene, player, tOut: k / FPS, dur, src: times[k] })
        await emit()
        k++
      }
    }
    if (commentInfo) {
      const vTrack = commentInfo.vTrack
      if (!(await vTrack.canDecode())) throw new Error(`本人コメントの動画：この端末のブラウザでは、この動画の形式（${vTrack.codec === 'hevc' ? 'HEVC（高効率）' : String(vTrack.codec ?? '不明')}）を読み込めません。iOSを最新にするか、iPhoneの「設定」→「カメラ」→「フォーマット」を「互換性優先」にして撮った動画でお試しください`)
      const sink = new CanvasSink(commentInfo.vTrack, { width: OUT_W, height: OUT_H, fit: 'cover', poolSize: 2 })
      const n = Math.round(commentInfo.dur * FPS)
      const times = Array.from({ length: n }, (_, k) => k / FPS)
      let k = 0
      for await (const wc of sink.canvasesAtTimestamps(times)) {
        if (wc) drawComment(ctx, wc.canvas, k / FPS, commentInfo.dur)
        await emit()
        k++
      }
    }
    for (let i = 0; i < CLOSE_SEC * FPS; i++) {
      drawCard(ctx, project, 'close', i / FPS, CLOSE_SEC)
      await emit()
    }

    onProgress(1, '仕上げ中')
    await audioSrc.add(audio)
    await output.finalize()
    const buf = (output.target as BufferTarget).buffer!
    const name = `${project.date}_${project.opponent || 'highlight'}.mp4`.replace(/[\\/:*?"<>|\s]/g, '_')
    return new File([buf], name, { type: 'video/mp4' })
  } finally {
    inputs.forEach(i => i.dispose())
    commentInfo?.input.dispose()
  }
}

type CommentInfo = { aTrack: Awaited<ReturnType<Input['getPrimaryAudioTrack']>>; dur: number }

async function renderAudio(project: Project, getInput: (k: string) => Input, bgm: File | null, total: number, commentInfo: CommentInfo | null) {
  const ac = new OfflineAudioContext(2, Math.ceil(total * SAMPLE_RATE), SAMPLE_RATE)
  // 効果音・試合音・BGMを重ねても割れないよう、最後にコンプレッサーを通す
  const master = ac.createDynamicsCompressor()
  master.threshold.value = -10
  master.ratio.value = 6
  master.attack.value = 0.001
  const trim = ac.createGain()
  trim.gain.value = 0.85
  // 立ち上がりの速い「ドン」はコンプが追いつかないので柔らかく頭打ちにする。AAC化での行き過ぎ分の余白も残す
  const clip = ac.createWaveShaper()
  clip.curve = Float32Array.from({ length: 2048 }, (_, i) => Math.tanh(((i / 2047) * 2 - 1) * 1.5) / Math.tanh(1.5) * 0.89)
  master.connect(trim).connect(clip).connect(ac.destination)
  let t = OPEN_SEC
  for (const scene of project.scenes) {
    const aTrack = await getInput(scene.sourceKey).getPrimaryAudioTrack()
    const dur = sceneOutDuration(scene)
    if (aTrack) {
      const buf = await readAudio(ac, aTrack, scene.start, scene.end)
      const r = slowRange(scene)
      const parts: [number, number][] = r ? [[scene.start, r[0]], [r[1], scene.end]] : [[scene.start, scene.end]]
      for (const [a, b] of parts) {
        if (b - a < 0.05) continue
        const node = ac.createBufferSource()
        node.buffer = buf
        const gain = ac.createGain()
        const when = t + outTimeAt(scene, a)
        const len = b - a
        const f = Math.min(0.15, len / 3)
        gain.gain.setValueAtTime(0, when)
        gain.gain.linearRampToValueAtTime(project.gameVolume, when + f)
        gain.gain.setValueAtTime(project.gameVolume, when + len - f)
        gain.gain.linearRampToValueAtTime(0, when + len)
        node.connect(gain).connect(master)
        node.start(when, a - scene.start, len)
      }
    }
    t += dur
  }
  if (commentInfo?.aTrack) {
    const buf = await readAudio(ac, commentInfo.aTrack, 0, commentInfo.dur)
    const node = ac.createBufferSource()
    node.buffer = buf
    const gain = ac.createGain()
    const f = Math.min(0.3, commentInfo.dur / 4)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(1, t + f)
    gain.gain.setValueAtTime(1, t + commentInfo.dur - f)
    gain.gain.linearRampToValueAtTime(0, t + commentInfo.dur)
    node.connect(gain).connect(master)
    node.start(t, 0, commentInfo.dur)
    t += commentInfo.dur
  }
  if (bgm) {
    const music = await ac.decodeAudioData(await bgm.arrayBuffer())
    const node = ac.createBufferSource()
    node.buffer = music
    node.loop = true
    const gain = ac.createGain()
    const v = project.bgmVolume
    gain.gain.setValueAtTime(0, 0)
    gain.gain.linearRampToValueAtTime(v, 1)
    gain.gain.setValueAtTime(v, Math.max(1, total - 2.5))
    gain.gain.linearRampToValueAtTime(0, total)
    node.connect(gain).connect(master)
    node.start(0, Math.min(project.bgmStart, Math.max(0, music.duration - 1)))
  }
  if (project.sfx) scheduleSfx(ac, master, project, total)
  return ac.startRendering()
}

function scheduleSfx(ac: BaseAudioContext, dest: AudioNode, project: Project, total: number) {
  const out = ac.createGain()
  out.gain.value = project.sfxVolume
  out.connect(dest)
  impact(ac, out, 0.15, 0.9)
  riser(ac, out, 1.2, OPEN_SEC)
  let t = OPEN_SEC
  for (const scene of project.scenes) {
    whoosh(ac, out, t)
    const r = slowRange(scene)
    if (r) slowDown(ac, out, t + outTimeAt(scene, r[0]), 0.8)
    if (scene.mark > scene.start && scene.mark < scene.end) impact(ac, out, t + outTimeAt(scene, scene.mark))
    t += sceneOutDuration(scene)
  }
  whoosh(ac, out, t)
  impact(ac, out, Math.min(total - 0.5, t + 0.15), 0.7)
}

async function readAudio(ac: BaseAudioContext, track: NonNullable<Awaited<ReturnType<Input['getPrimaryAudioTrack']>>>, start: number, end: number) {
  const sr = await track.getSampleRate()
  const out = ac.createBuffer(2, Math.max(1, Math.ceil((end - start) * sr)), sr)
  const L = out.getChannelData(0)
  const R = out.getChannelData(1)
  const sink = new AudioSampleSink(track)
  for await (const s of sink.samples(start, end)) {
    const b = s.toAudioBuffer()
    const offset = Math.round((s.timestamp - start) * sr)
    const l = b.getChannelData(0)
    const r = b.numberOfChannels > 1 ? b.getChannelData(1) : l
    for (let i = 0; i < l.length; i++) {
      const j = offset + i
      if (j >= 0 && j < L.length) { L[j] = l[i]; R[j] = r[i] }
    }
    s.close()
  }
  return out
}
