// 「歓声が大きくなった場所」をマークの候補として拾う。機械学習は使わず、
// 音量の変化だけを見る単純な仕組み（風・雑談・実況などでも反応することはある。
// あくまで見返す場所の目安で、採用するかどうかは必ず人が判断する）。
import { AudioSampleSink, Input } from 'mediabunny'
import type { InputAudioTrack } from 'mediabunny'

export type Candidate = { t: number; score: number }

const BUCKET_SEC = 0.2

export async function findCheerPeaks(
  input: Input,
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
): Promise<Candidate[]> {
  const track: InputAudioTrack | null = await input.getPrimaryAudioTrack()
  if (!track) return []
  const duration = await input.computeDuration()
  if (!duration || duration < BUCKET_SEC * 4) return []

  const bucketCount = Math.ceil(duration / BUCKET_SEC)
  const sumSq = new Float64Array(bucketCount)
  const count = new Int32Array(bucketCount)

  const sink = new AudioSampleSink(track)
  for await (const s of sink.samples(0, duration)) {
    if (signal?.aborted) throw new DOMException('中止しました', 'AbortError')
    const bi = Math.min(bucketCount - 1, Math.floor(s.timestamp / BUCKET_SEC))
    const buf = s.toAudioBuffer()
    const ch = buf.getChannelData(0)
    let sum = 0
    for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i]
    sumSq[bi] += sum
    count[bi] += ch.length
    s.close()
    onProgress?.(Math.min(1, s.timestamp / duration))
  }

  // 各バケットのRMS音量 → 短い移動平均で滑らかにする
  const env = new Float64Array(bucketCount)
  for (let i = 0; i < bucketCount; i++) env[i] = count[i] > 0 ? Math.sqrt(sumSq[i] / count[i]) : 0
  const smooth = new Float64Array(bucketCount)
  const R = 2 // ±0.4秒
  for (let i = 0; i < bucketCount; i++) {
    let s = 0, n = 0
    for (let j = Math.max(0, i - R); j <= Math.min(bucketCount - 1, i + R); j++) { s += env[j]; n++ }
    smooth[i] = s / n
  }

  // 全体の中央値を「普段の音量」として、そこから頭一つ抜けた場所を候補にする
  const sorted = Float64Array.from(smooth).sort()
  const median = sorted[Math.floor(sorted.length / 2)] || 0
  const threshold = Math.max(median * 1.7, median + 0.01)

  const winBuckets = Math.round(1.5 / BUCKET_SEC) // 局所的な山かどうかの判定幅
  const raw: Candidate[] = []
  for (let i = 0; i < bucketCount; i++) {
    if (smooth[i] < threshold) continue
    let isPeak = true
    for (let j = Math.max(0, i - winBuckets); j <= Math.min(bucketCount - 1, i + winBuckets); j++) {
      if (smooth[j] > smooth[i]) { isPeak = false; break }
    }
    if (isPeak) raw.push({ t: i * BUCKET_SEC, score: median > 0 ? smooth[i] / median : smooth[i] })
  }

  // 近い候補は一番大きい音のものだけ残す
  raw.sort((a, b) => b.score - a.score)
  const minGap = 12
  const kept: Candidate[] = []
  for (const c of raw) {
    if (kept.some(k => Math.abs(k.t - c.t) < minGap)) continue
    kept.push(c)
  }

  const maxCandidates = Math.min(30, Math.max(6, Math.round(duration / 90)))
  return kept.slice(0, maxCandidates).sort((a, b) => a.t - b.t)
}
