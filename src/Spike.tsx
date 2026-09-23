import { useMemo, useRef, useState } from 'react'
import {
  ALL_FORMATS, AudioSampleSink, AudioSampleSource, BlobSource, BufferTarget, CanvasSink, CanvasSource,
  Input, Mp4OutputFormat, Output, QUALITY_HIGH, canEncodeAudio, canEncodeVideo,
} from 'mediabunny'

const OUT_W = 1920
const OUT_H = 1080
const FPS = 30
const NORMAL_SEC = 6
const SLOW_SRC_SEC = 2
const SLOW_RATE = 0.5

export default function Spike() {
  const [file, setFile] = useState<File | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [start, setStart] = useState(60)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<File | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileUrl = useMemo(() => file && URL.createObjectURL(file), [file])
  const resultUrl = useMemo(() => result && URL.createObjectURL(result), [result])

  const add = (s: string) => setLog(l => [...l, s])

  async function checkSupport() {
    add(`UA: ${navigator.userAgent}`)
    add(`WebCodecs: VideoEncoder=${'VideoEncoder' in window} AudioEncoder=${'AudioEncoder' in window}`)
    add(`H.264 1080p エンコード: ${await canEncodeVideo('avc', { width: OUT_W, height: OUT_H })}`)
    add(`AAC エンコード: ${await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000 })}`)
    add(`Opus エンコード: ${await canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: 48000 })}`)
  }

  async function onPick(f: File) {
    setFile(f)
    setResult(null)
    add(`--- 選択: ${f.name} / ${(f.size / 1e9).toFixed(2)} GB / ${f.type} / 更新 ${new Date(f.lastModified).toLocaleString()}`)
    const t0 = performance.now()
    const input = new Input({ source: new BlobSource(f), formats: ALL_FORMATS })
    const v = await input.getPrimaryVideoTrack()
    const a = await input.getPrimaryAudioTrack()
    const dur = await input.computeDuration()
    add(`長さ ${dur.toFixed(1)}s / 解析 ${((performance.now() - t0) / 1000).toFixed(1)}s`)
    if (v) {
      const stats = await v.computePacketStats(300)
      add(`映像: ${await v.getCodec()} ${await v.getDisplayWidth()}x${await v.getDisplayHeight()} 約${stats.averagePacketRate.toFixed(2)}fps 回転${v.rotation}`)
    }
    if (a) add(`音声: ${await a.getCodec()} ${await a.getSampleRate()}Hz ${await a.getNumberOfChannels()}ch`)
    input.dispose()
  }

  async function runExport() {
    if (!file) return
    setBusy(true)
    setResult(null)
    setProgress(0)
    let wakeLock: WakeLockSentinel | null = null
    try {
      wakeLock = await navigator.wakeLock?.request('screen').catch(() => null)
      const t0 = performance.now()
      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
      const vTrack = await input.getPrimaryVideoTrack()
      const aTrack = await input.getPrimaryAudioTrack()
      if (!vTrack) throw new Error('映像トラックなし')

      const canvas = canvasRef.current!
      canvas.width = OUT_W
      canvas.height = OUT_H
      const ctx = canvas.getContext('2d')!

      const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
      const videoSource = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH })
      output.addVideoTrack(videoSource, { frameRate: FPS })
      let audioSource: AudioSampleSource | null = null
      if (aTrack) {
        audioSource = new AudioSampleSource({ codec: 'aac', bitrate: QUALITY_HIGH })
        output.addAudioTrack(audioSource)
      }
      await output.start()

      // 通常速度 → スロー区間の順に、出力フレームごとの元動画タイムスタンプを並べる
      const srcTimes: number[] = []
      for (let i = 0; i < NORMAL_SEC * FPS; i++) srcTimes.push(start + i / FPS)
      const slowFrames = Math.round((SLOW_SRC_SEC / SLOW_RATE) * FPS)
      for (let i = 0; i < slowFrames; i++) srcTimes.push(start + NORMAL_SEC + (i * SLOW_RATE) / FPS)
      const total = srcTimes.length

      const sink = new CanvasSink(vTrack, { width: OUT_W, height: OUT_H, fit: 'cover', poolSize: 2 })
      let i = 0
      for await (const wc of sink.canvasesAtTimestamps(srcTimes)) {
        const p = i / (total - 1)
        const zoom = 1 + 0.6 * Math.min(1, p * 1.5)
        const sw = OUT_W / zoom
        const sh = OUT_H / zoom
        const sx = (OUT_W - sw) * 0.5
        const sy = (OUT_H - sh) * 0.55
        if (wc) ctx.drawImage(wc.canvas, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H)
        drawTelop(ctx, i / FPS)
        await videoSource.add(i / FPS, 1 / FPS)
        i++
        if (i % 15 === 0) setProgress(i / total)
      }
      const tVideo = performance.now()

      if (aTrack && audioSource) {
        const aSink = new AudioSampleSink(aTrack)
        for await (const s of aSink.samples(start, start + NORMAL_SEC)) {
          s.setTimestamp(s.timestamp - start)
          await audioSource.add(s)
          s.close()
        }
      }
      await output.finalize()
      input.dispose()
      const t1 = performance.now()
      const outSec = total / FPS
      const buf = (output.target as BufferTarget).buffer!
      add(`書き出し完了: 出力${outSec.toFixed(1)}s / 映像${((tVideo - t0) / 1000).toFixed(1)}s / 全体${((t1 - t0) / 1000).toFixed(1)}s / 実時間比 ${(outSec / ((t1 - t0) / 1000)).toFixed(2)}倍速 / ${(buf.byteLength / 1e6).toFixed(1)}MB`)
      setResult(new File([buf], `highlight_test_${Date.now()}.mp4`, { type: 'video/mp4' }))
      setProgress(1)
    } catch (e) {
      add(`エラー: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`)
    } finally {
      await wakeLock?.release()
      setBusy(false)
    }
  }

  async function share() {
    if (!result) return
    try {
      await navigator.share({ files: [result] })
    } catch (e) {
      add(`共有: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="min-h-svh bg-slate-50 text-slate-900 p-4 pb-16 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold">Step 0 技術検証</h1>

      <section className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <button onClick={checkSupport} className="w-full py-3 rounded-lg bg-slate-800 text-white font-medium">1. 対応状況チェック</button>
        <label className="block">
          <span className="text-sm font-medium">2. 試合動画を選ぶ</span>
          <input type="file" accept="video/*" className="mt-1 block w-full text-sm"
            onChange={e => e.target.files?.[0] && onPick(e.target.files[0])} />
        </label>
        {fileUrl && <video src={fileUrl} controls playsInline className="w-full rounded-lg bg-black" />}
        <label className="flex items-center gap-2 text-sm">
          切り出し開始（秒）
          <input type="number" value={start} onChange={e => setStart(Number(e.target.value))}
            className="w-24 border rounded px-2 py-1" />
        </label>
        <button onClick={runExport} disabled={!file || busy}
          className="w-full py-3 rounded-lg bg-emerald-600 text-white font-medium disabled:opacity-40">
          3. テスト書き出し（通常{NORMAL_SEC}秒＋スロー{SLOW_SRC_SEC / SLOW_RATE}秒・ズーム・テロップ）
        </button>
        {busy && <div className="h-2 bg-slate-200 rounded"><div className="h-2 bg-emerald-500 rounded" style={{ width: `${progress * 100}%` }} /></div>}
      </section>

      <canvas ref={canvasRef} className="w-full rounded-lg bg-black aspect-video" />

      {result && (
        <section className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <video src={resultUrl ?? undefined} controls playsInline className="w-full rounded-lg bg-black" />
          <button onClick={share} className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium">4. 共有 →「ビデオを保存」</button>
        </section>
      )}

      <section className="bg-slate-900 text-slate-100 rounded-xl p-3 text-xs font-mono whitespace-pre-wrap break-all space-y-1">
        {log.length === 0 ? 'ログ' : log.map((l, i) => <div key={i}>{l}</div>)}
      </section>
    </div>
  )
}

function drawTelop(ctx: CanvasRenderingContext2D, t: number) {
  if (t < 1) return
  const x = 80, y = OUT_H - 200
  ctx.fillStyle = 'rgba(10,20,60,0.85)'
  ctx.fillRect(x, y, 620, 110)
  ctx.fillStyle = '#facc15'
  ctx.fillRect(x, y, 12, 110)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 56px -apple-system, "Hiragino Sans", sans-serif'
  ctx.fillText('#7 ○○○○', x + 40, y + 75)
  ctx.fillStyle = '#facc15'
  ctx.font = 'italic 900 56px -apple-system, sans-serif'
  ctx.fillText('GOAL!', x + 400, y + 75)
}
