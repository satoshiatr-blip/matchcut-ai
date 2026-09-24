import { useEffect, useMemo, useRef, useState } from 'react'
import { newNote, useReflections, type NoteKind, type ReflectionNote } from '../reflections'
import { extractGrowthClip } from '../growth'
import { deleteGrowthClip, loadGrowthClip } from '../idb'
import { Button, Card, ScreenTitle, Toast, fmt, useObjectUrl, type ProjectProps } from './ui'
import { IconCheck, IconNotebook, IconPlay, IconShare, IconTrendUp, IconVideo } from './icons'

type Props = ProjectProps & { files: Map<string, File> }

const KIND_UI: Record<NoteKind, { label: string; Icon: typeof IconCheck; cls: string }> = {
  done: { label: 'できた', Icon: IconCheck, cls: 'bg-gradient-to-br from-brand to-[#2f8bff] text-white shadow-[0_8px_28px_-8px_rgba(26,115,255,0.9)]' },
  next: { label: '次に試す', Icon: IconTrendUp, cls: 'bg-raised text-cyan border border-cyan/60 shadow-[0_8px_28px_-10px_rgba(62,224,255,0.6)]' },
}

export default function ReflectionTab({ project, files }: Props) {
  const [notes, setNotes] = useReflections()
  const [themeFilter, setThemeFilter] = useState<string | null>(null)
  const [activeKey, setActiveKey] = useState(project.sources[0]?.key ?? '')
  const [toast, setToast] = useState('')
  const [editing, setEditing] = useState<ReflectionNote | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const videoSectionRef = useRef<HTMLDivElement>(null)
  const pendingSeekRef = useRef<number | null>(null)

  const active = project.sources.find(s => s.key === activeKey) ?? project.sources[0]
  const file = active && files.get(active.key)
  const url = useObjectUrl(file)
  const matchLabel = [project.title, project.opponent && `VS ${project.opponent}`, project.date].filter(Boolean).join('　')
  const themes = useMemo(() => [...new Set(notes.map(n => n.theme).filter(Boolean))].slice(-8), [notes])
  const shown = [...notes].filter(n => !themeFilter || n.theme === themeFilter).sort((a, b) => b.createdAt - a.createdAt)

  function mark(kind: NoteKind) {
    const v = videoRef.current
    if (!v || !active) return
    const n = newNote(matchLabel, active.key, v.currentTime, kind)
    setNotes(ns => [...ns, n])
    setToast(`${KIND_UI[kind].label}を記録  ${fmt(v.currentTime)}`)
    setTimeout(() => setToast(''), 1400)
    setEditing(n)
  }

  function deleteNote(id: string) {
    setNotes(ns => ns.filter(x => x.id !== id))
    deleteGrowthClip(id)
  }

  // メモの瞬間へ、今表示中の動画プレーヤーをジャンプさせる（書き出し不要ですぐ見られる）
  function jumpTo(sourceKey: string, time: number) {
    const seekAndPlay = () => {
      const v = videoRef.current
      if (!v) return
      v.currentTime = time
      v.play().catch(() => {})
    }
    if (sourceKey === activeKey) {
      seekAndPlay()
    } else {
      pendingSeekRef.current = time
      setActiveKey(sourceKey)
    }
    videoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-4">
      <ScreenTitle step="05" en="REFLECT" title="振り返り" sub="良かった所も、次への課題も。親子で一緒に見返すメモです" />

      {project.sources.length === 0 ? (
        <Card className="text-center py-12 px-6 space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-raised border border-line grid place-items-center text-3xl text-cyan"><IconVideo /></div>
          <p className="text-muted">「マーク」タブで動画を選ぶと、ここで見返しながら記録できます</p>
        </Card>
      ) : (
        <>
          <div ref={videoSectionRef} className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 [scrollbar-width:none]">
            {project.sources.map((s, i) => (
              <button key={s.key} onClick={() => setActiveKey(s.key)}
                className={`shrink-0 h-9 px-4 rounded-full text-sm font-bold border transition ${s.key === active?.key ? 'bg-fg text-ink border-fg' : 'bg-surface text-muted border-line'}`}>
                {i + 1}. {s.name}
              </button>
            ))}
          </div>

          <div className="-mx-5 sm:mx-0 sm:rounded-2xl overflow-hidden bg-black border-y sm:border border-line">
            {url ? (
              <video ref={videoRef} src={url} playsInline controls className="w-full aspect-video"
                onLoadedMetadata={() => {
                  if (pendingSeekRef.current == null) return
                  const v = videoRef.current
                  if (v) { v.currentTime = pendingSeekRef.current; v.play().catch(() => {}) }
                  pendingSeekRef.current = null
                }} />
            ) : (
              <div className="aspect-video grid place-items-center text-muted text-sm">動画を選び直してください</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {(['done', 'next'] as NoteKind[]).map(k => {
              const { Icon, label, cls } = KIND_UI[k]
              return (
                <button key={k} disabled={!url} onClick={() => mark(k)}
                  className={`flex flex-col items-center justify-center gap-1.5 h-24 rounded-2xl font-black italic text-lg transition active:scale-95 disabled:opacity-35 ${cls}`}>
                  <Icon className="text-3xl" />{label}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted text-center">一時停止して、見せたい瞬間でタップしてください</p>
        </>
      )}

      {editing && (
        <NoteEditor note={editing} themes={themes}
          onChange={n => { setNotes(ns => ns.map(x => x.id === n.id ? n : x)); setEditing(n) }}
          onDelete={() => { deleteNote(editing.id); setEditing(null) }}
          onClose={() => setEditing(null)} />
      )}
      <Toast text={toast} />

      {notes.length > 0 && (
        <div className="space-y-3 pt-3 border-t border-line">
          <p className="text-xs font-bold text-muted px-1">これまでの記録</p>
          {themes.length > 0 && (
            <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 [scrollbar-width:none]">
              <button onClick={() => setThemeFilter(null)}
                className={`shrink-0 h-9 px-4 rounded-full text-sm font-bold border ${!themeFilter ? 'bg-fg text-ink border-fg' : 'bg-surface text-muted border-line'}`}>すべて</button>
              {themes.map(t => (
                <button key={t} onClick={() => setThemeFilter(t)}
                  className={`shrink-0 h-9 px-4 rounded-full text-sm font-bold border ${themeFilter === t ? 'bg-fg text-ink border-fg' : 'bg-surface text-muted border-line'}`}>{t}</button>
              ))}
            </div>
          )}
          <ol className="space-y-2.5">
            {shown.map(n => (
              <NoteRow key={n.id} note={n} sourceFile={files.get(n.sourceKey)}
                onJump={() => jumpTo(n.sourceKey, n.time)}
                onUpdate={patch => setNotes(ns => ns.map(x => x.id === n.id ? { ...x, ...patch } : x))}
                onDelete={() => deleteNote(n.id)} />
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

function NoteEditor({ note, themes, onChange, onDelete, onClose }:
  { note: ReflectionNote; themes: string[]; onChange: (n: ReflectionNote) => void; onDelete: () => void; onClose: () => void }) {
  return (
    <Card className="!border-cyan/30 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold flex items-center gap-1.5"><IconNotebook className="text-cyan" />{KIND_UI[note.kind].label}・{fmt(note.time)}</span>
        <button className="text-xs text-danger" onClick={onDelete}>削除</button>
      </div>
      <div>
        <p className="text-xs text-muted mb-1.5">テーマ（任意・例：逆足トラップ）</p>
        <input className="w-full h-11 rounded-xl bg-raised border border-line px-3.5 text-base"
          value={note.theme} placeholder="テーマを書く" onChange={e => onChange({ ...note, theme: e.target.value })} />
        {themes.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            {themes.map(t => (
              <button key={t} onClick={() => onChange({ ...note, theme: t })}
                className={`h-8 px-3 rounded-full text-xs font-bold border ${note.theme === t ? 'bg-fg text-ink border-fg' : 'bg-raised text-muted border-line'}`}>{t}</button>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="text-xs text-muted mb-1.5">本人の一言</p>
        <textarea className="w-full min-h-20 rounded-xl bg-raised border border-line px-3.5 py-2.5 text-base resize-none"
          value={note.note} placeholder="例：顔を上げてから止められた" onChange={e => onChange({ ...note, note: e.target.value })} />
      </div>
      <Button variant="primary" className="w-full" onClick={onClose}>閉じる</Button>
    </Card>
  )
}

// 端末に保存した短い動画クリップをFileとして読み込む。versionを変えると再取得する
function useGrowthClipFile(noteId: string | null, version: number) {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'missing'; file: File | null }>({ status: 'loading', file: null })
  useEffect(() => {
    setState({ status: 'loading', file: null })
    if (!noteId) return
    let cancelled = false
    loadGrowthClip(noteId).then(f => {
      if (cancelled) return
      setState(f ? { status: 'ready', file: f } : { status: 'missing', file: null })
    })
    return () => { cancelled = true }
  }, [noteId, version])
  return state
}

function NoteRow({ note: n, sourceFile, onJump, onUpdate, onDelete }: {
  note: ReflectionNote
  sourceFile: File | undefined
  onJump: () => void
  onUpdate: (patch: Partial<ReflectionNote>) => void
  onDelete: () => void
}) {
  const { Icon, label, cls } = KIND_UI[n.kind]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [clipVersion, setClipVersion] = useState(0)
  const clip = useGrowthClipFile(n.hasClip ? n.id : null, clipVersion)

  async function shareClip() {
    setError(false)
    let file = clip.status === 'ready' ? clip.file : null
    if (!file) {
      if (!sourceFile) { setError(true); return }
      setBusy(true)
      const ok = await extractGrowthClip(n.id, sourceFile, n.time)
      setBusy(false)
      if (!ok) { setError(true); return }
      onUpdate({ hasClip: true })
      setClipVersion(v => v + 1)
      file = await loadGrowthClip(n.id) ?? null
    }
    if (!file) { setError(true); return }
    try { await navigator.share({ files: [file] }) } catch { /* キャンセルは無視 */ }
  }

  return (
    <li className="bg-surface border border-line rounded-2xl p-3.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1 text-xs font-black px-2 py-1 rounded-full ${cls}`}><Icon className="text-sm" />{label}</span>
        <button className="text-xs text-muted" onClick={onDelete}>削除</button>
      </div>
      {n.theme && <p className="text-xs font-bold text-cyan">{n.theme}</p>}
      {n.note && <p className="text-sm">{n.note}</p>}
      <p className="text-[11px] text-muted">{n.matchLabel || '試合'}・{new Date(n.createdAt).toLocaleDateString('ja-JP')}</p>

      <div className="flex gap-2 pt-0.5">
        {sourceFile && (
          <button onClick={onJump}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-bold border border-cyan/50 text-cyan bg-cyan/10">
            <IconPlay className="text-sm" />この場面を見る
          </button>
        )}
        {(sourceFile || n.hasClip) && (
          <button onClick={shareClip} disabled={busy}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-bold border border-line text-muted disabled:opacity-50">
            <IconShare className="text-sm" />{busy ? '書き出し中…' : '共有する'}
          </button>
        )}
      </div>
      {!sourceFile && !n.hasClip && (
        <p className="text-[11px] text-muted">元の動画がこのセッションに無いため見返せません</p>
      )}
      {error && <p className="text-xs text-danger">動画の準備に失敗しました。もう一度お試しください</p>}
    </li>
  )
}
