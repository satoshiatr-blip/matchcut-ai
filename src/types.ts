export type SceneKind = 'goal' | 'save' | 'play'

export const KIND_LABEL: Record<SceneKind, string> = { goal: 'GOAL!', save: 'NICE SAVE!', play: 'NICE PLAY!' }
export const KIND_JA: Record<SceneKind, string> = { goal: 'ゴール', save: 'セーブ', play: '好プレー' }

export type Player = { id: string; number: string; name: string }

// cx, cy は元動画に対する正規化座標(0〜1)、scale は拡大率
export type ZoomRect = { cx: number; cy: number; scale: number }

export type Scene = {
  id: string
  sourceKey: string
  mark: number
  start: number
  end: number
  kind: SceneKind
  playerId: string | null
  slow: boolean
  slowAt: number
  slowLen: number
  zoomFrom: ZoomRect
  zoomTo: ZoomRect
}

export type SourceMeta = { key: string; name: string; size: number; duration: number }

export type Project = {
  title: string
  date: string
  team: string
  opponent: string
  color: string
  players: Player[]
  sources: SourceMeta[]
  scenes: Scene[]
  gameVolume: number
  bgmVolume: number
  grade: boolean
  sfx: boolean
  sfxVolume: number
  bgmStart: number
  showNames: boolean
  // 歓声のピーク検出で見つけた「見返す場所」の候補。動画ごとに秒のリストを持つ
  aiCandidates: Record<string, number[]>
}

export const sourceKey = (f: File) => `${f.name}:${f.size}`

export const uid = () => Math.random().toString(36).slice(2, 10)
