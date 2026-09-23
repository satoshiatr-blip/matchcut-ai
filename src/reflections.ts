import { useEffect, useState } from 'react'
import { idbGet, idbSet } from './idb'
import { uid } from './types'

// 「振り返りメモ」は試合（プロジェクト）とは別に、ずっと積み上がっていくデータとして持つ。
// 新しい試合を始めてもリセットされない（localStorage と IndexedDB の両方に保存＝チーム名簿と同じ方式）。
export type NoteKind = 'done' | 'next'

export type ReflectionNote = {
  id: string
  createdAt: number
  matchLabel: string // 記録した時点の「対戦相手・日付」など。動画が無くても振り返れるように残す
  sourceKey: string // 同じセッション中だけ、動画の再生に使う
  time: number
  kind: NoteKind
  theme: string // 例:「逆足トラップ」。空でもよい
  note: string // 本人の一言
}

const KEY = 'matchcut-ai:reflections'

function readLocal(): ReflectionNote[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function useReflections() {
  const [notes, setNotes] = useState<ReflectionNote[]>(readLocal)

  useEffect(() => {
    if (notes.length > 0) return
    idbGet<ReflectionNote[]>(KEY).then(saved => {
      if (saved?.length) setNotes(n => n.length ? n : saved)
    })
    // 起動時の復元だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(notes)) } catch { /* 無視 */ }
    idbSet(KEY, notes)
  }, [notes])

  return [notes, setNotes] as const
}

export function newNote(matchLabel: string, sourceKey: string, time: number, kind: NoteKind): ReflectionNote {
  return { id: uid(), createdAt: Date.now(), matchLabel, sourceKey, time, kind, theme: '', note: '' }
}
