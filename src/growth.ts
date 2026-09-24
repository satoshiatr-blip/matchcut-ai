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

// メモを記録した瞬間の前後だけを、軽い解像度で切り出して保存する
export async function extractGrowthClip(noteId: string, sourceFile: File, atTime: number): Promise<boolean> {
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

    const sink = new CanvasSink(vTrack, { width: CLIP_W, height: CLIP_H, fit: 'cover', poolSize: 2 })
    const n = Math.round((end - start) * CLIP_FPS)
    const times = Array.from({ length: n }, (_, i) => start + i / CLIP_FPS)
    let i = 0
    for await (const wc of sink.canvasesAtTimestamps(times)) {
      if (wc) ctx.drawImage(wc.canvas, 0, 0, CLIP_W, CLIP_H)
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
