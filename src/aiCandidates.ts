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

  // 「普段の音量」を1つの値（全体の中央値）で決めず、20秒ごとの区間中央値を線形補間して
  // 局所的なベースラインにする。実況や風で音量が上下しても、その場その場を基準に判定できる
  const CHUNK_SEC = 20
  const chunkBuckets = Math.max(1, Math.round(CHUNK_SEC / BUCKET_SEC))
  const chunkCount = Math.max(1, Math.ceil(bucketCount / chunkBuckets))
  const chunkMedian = new Float64Array(chunkCount)
  for (let c = 0; c < chunkCount; c++) {
    const start = c * chunkBuckets
    const end = Math.min(bucketCount, start + chunkBuckets)
    const slice = Float64Array.from(smooth.slice(start, end)).sort()
    chunkMedian[c] = slice.length ? slice[Math.floor(slice.length / 2)] : 0
  }
  const baseline = new Float64Array(bucketCount)
  for (let i = 0; i < bucketCount; i++) {
    const pos = i / chunkBuckets - 0.5 // 区間の中心を基準にした連続位置
    const c0 = Math.max(0, Math.min(chunkCount - 1, Math.floor(pos)))
    const c1 = Math.max(0, Math.min(chunkCount - 1, c0 + 1))
    const frac = Math.max(0, Math.min(1, pos - c0))
    baseline[i] = chunkMedian[c0] * (1 - frac) + chunkMedian[c1] * frac
  }

  const winBuckets = Math.round(1.5 / BUCKET_SEC) // 局所的な山かどうかの判定幅
  const SUSTAIN_SEC = 0.8 // 山の周辺でこれだけの秒数、音量が高い状態が続くことを要求
  const sustainBuckets = Math.max(1, Math.round(SUSTAIN_SEC / BUCKET_SEC))
  const riseBuckets = Math.round(1.0 / BUCKET_SEC) // 1秒前と比べて立ち上がりの急さを見る

  const raw: Candidate[] = []
  for (let i = 0; i < bucketCount; i++) {
    const base = baseline[i]
    const threshold = Math.max(base * 1.7, base + 0.01)
    if (smooth[i] < threshold) continue

    let isPeak = true
    for (let j = Math.max(0, i - winBuckets); j <= Math.min(bucketCount - 1, i + winBuckets); j++) {
      if (smooth[j] > smooth[i]) { isPeak = false; break }
    }
    if (!isPeak) continue

    // 持続チェック: 笛やボールの衝突音のような一瞬だけの破裂音を除き、しばらく続く盛り上がりだけを拾う
    const sustainFloor = base * 1.3
    let sustained = 0
    for (let j = Math.max(0, i - sustainBuckets); j <= Math.min(bucketCount - 1, i + sustainBuckets); j++) {
      if (smooth[j] >= sustainFloor) sustained++
    }
    if (sustained * BUCKET_SEC < SUSTAIN_SEC) continue

    // 立ち上がりの急さをスコアに加点。ずっと大きい雑音より「急に沸いた」瞬間を優先して残す
    const prevIdx = Math.max(0, i - riseBuckets)
    const rise = Math.max(0, smooth[i] - smooth[prevIdx])
    const riseBonus = base > 0 ? rise / base : 0

    const level = base > 0 ? smooth[i] / base : smooth[i]
    raw.push({ t: i * BUCKET_SEC, score: level * (1 + Math.min(1, riseBonus)) })
  }

  // 近い候補は一番スコアが高いものだけ残す
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
