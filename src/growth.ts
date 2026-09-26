// 振り返りメモの瞬間だけを短い動画として切り出す（本人と共有できる単体クリップ）。
// 試合動画そのもの（数GB）は「新しい試合を始める」で消えるが、切り出したクリップは端末に残す
import {
  ALL_FORMATS, AudioSampleSink, AudioSampleSource, BlobSource, BufferTarget,
  CanvasSink, CanvasSource, Input, Mp4OutputFormat, Output, canEncodeAudio, canEncodeVideo,
} from 'mediabunny'
import { saveGrowthClip } from './idb'

const CLIP_W = 960
const CLIP_H = 540
const CLIP_FPS = 24
const PRE = 2.5
const POST = 3.5
const FONT = '-apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif'

function truncate(ctx: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1)
  return t + '…'
}

// 動画の下にテーマ・本人の一言を焼き込む
function drawInfoBar(ctx: OffscreenCanvasRenderingContext2D, theme: string, note: string) {
  if (!theme && !note) return
  const padX = 20
  const h = theme && note ? 76 : 46
  const y = CLIP_H - h
  ctx.fillStyle = 'rgba(4,6,12,0.72)'
  ctx.fillRect(0, y, CLIP_W, h)
  let ty = y + (theme && note ? 30 : 29)
  if (theme) {
    ctx.font = '900 24px ' + FONT
    ctx.fillStyle = '#e13bff'
    ctx.textAlign = 'left'
    ctx.fillText(truncate(ctx, theme, CLIP_W - padX * 2), padX, ty)
    ty += 28
  }
  if (note) {
    ctx.font = '600 20px ' + FONT
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.textAlign = 'left'
    ctx.fillText(truncate(ctx, note, CLIP_W - padX * 2), padX, ty)
  }
}

// メモを記録した瞬間の前後だけを、軽い解像度で切り出して保存する
export async function extractGrowthClip(noteId: string, sourceFile: File, atTime: number, theme: string, note: string): Promise<boolean> {
  const input = new Input({ source: new BlobSource(sourceFile), formats: ALL_FORMATS })
  try {
    if (!(await canEncodeVideo('avc', { width: CLIP_W, height: CLIP_H }))) return false
    const vTrack = await input.getPrimaryVideoTrack()
    if (!vTrack) return false
    const dur = await input.computeDuration()
    const start = Math.max(0, atTime - PRE)
    const end = Math.min(dur, atTime + POST)
    if (end - start < 1) return false

    const canvas = new OffscreenCanvas(CLIP_W, CLIP_H)
    const ctx = canvas.getContext('2d')!
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
    const video = new CanvasSource(canvas, { codec: 'avc', bitrate: 2_000_000 })
    output.addVideoTrack(video, { frameRate: CLIP_FPS })
    const aTrack = await input.getPrimaryAudioTrack()
    const canAac = aTrack && (await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000 }))
    let audioSrc: AudioSampleSource | null = null
    if (canAac) {
      audioSrc = new AudioSampleSource({ codec: 'aac', bitrate: 128_000 })
      output.addAudioTrack(audioSrc)
    }
    await output.start()

    if (!(await vTrack.canDecode())) throw new Error(`この端末のブラウザでは、この動画の形式（${vTrack.codec === 'hevc' ? 'HEVC（高効率）' : String(vTrack.codec ?? '不明')}）を読み込めません。iOSを最新にするか、iPhoneの「設定」→「カメラ」→「フォーマット」を「互換性優先」にして撮った動画でお試しください`)
    const sink = new CanvasSink(vTrack, { width: CLIP_W, height: CLIP_H, fit: 'cover', poolSize: 2 })
    const n = Math.round((end - start) * CLIP_FPS)
    const times = Array.from({ length: n }, (_, i) => start + i / CLIP_FPS)
    let i = 0
    for await (const wc of sink.canvasesAtTimestamps(times)) {
      if (wc) ctx.drawImage(wc.canvas, 0, 0, CLIP_W, CLIP_H)
      drawInfoBar(ctx, theme, note)
      await video.add(i / CLIP_FPS, 1 / CLIP_FPS)
      i++
    }
    if (aTrack && audioSrc) {
      const aSink = new AudioSampleSink(aTrack)
      for await (const s of aSink.samples(start, end)) {
        s.setTimestamp(s.timestamp - start)
        await audioSrc.add(s)
        s.close()
      }
    }
    await output.finalize()
    const buf = (output.target as BufferTarget).buffer!
    await saveGrowthClip(noteId, new File([buf], `clip_${noteId}.mp4`, { type: 'video/mp4' }))
    return true
  } catch {
    return false
  } finally {
    input.dispose()
  }
}
