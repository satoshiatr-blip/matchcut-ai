import { useMemo, useRef, useState } from 'react'
import { newNote, useReflections, type NoteKind, type ReflectionNote } from '../reflections'
import type { Project } from '../types'
import { Button, Card, ScreenTitle, Segmented, Toast, fmt, useObjectUrl, type ProjectProps } from './ui'
import { IconCheck, IconNotebook, IconTrendUp, IconVideo } from './icons'

type Props = ProjectProps & { files: Map<string, File> }

const KIND_UI: Record<NoteKind, { label: string; Icon: typeof IconCheck; cls: string }> = {
  done: { label: 'できた', Icon: IconCheck, cls: 'bg-gradient-to-br from-brand to-[#2f8bff] text-white shadow-[0_8px_28px_-8px_rgba(26,115,255,0.9)]' },
  next: { label: '次に試す', Icon: IconTrendUp, cls: 'bg-raised text-cyan border border-cyan/60 shadow-[0_8px_28px_-10px_rgba(62,224,255,0.6)]' },
}

export default function ReflectionTab({ project, files }: Props) {
  const [notes, setNotes] = useReflections()
  const [mode, setMode] = useState<'record' | 'browse'>('record')

  return (
    <div className="space-y-4">
      <ScreenTitle step="05" en="REFLECT" title="振り返り" sub="良かった所も、次への課題も。親子で一緒に見返すメモです" />
      <Segmented value={mode} onChange={setMode} options={[
        { v: 'record', label: '記録する' },
        { v: 'browse', label: '見返す' },
      ]} />
      {mode === 'record'
        ? <RecordPane sources={project.sources} title={project.title} opponent={project.opponent} date={project.date} files={files} notes={notes} setNotes={setNotes} />
        : <BrowsePane notes={notes} setNotes={setNotes} />}
    </div>
  )
}

function RecordPane({ sources, title, opponent, date, files, notes, setNotes }: {
  sources: Project['sources']; title: string; opponent: string; date: string
  files: Map<string, File>; notes: ReflectionNote[]; setNotes: (f: (n: ReflectionNote[]) => ReflectionNote[]) => void
}) {
  const [activeKey, setActiveKey] = useState(sources[0]?.key ?? '')
  const [toast, setToast] = useState('')
  const [editing, setEditing] = useState<ReflectionNote | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const active = sources.find(s => s.key === activeKey) ?? sources[0]
  const file = active && files.get(active.key)
  const url = useObjectUrl(file)
  const matchLabel = [title, opponent && `VS ${opponent}`, date].filter(Boolean).join('　')
  const themes = useMemo(() => [...new Set(notes.map(n => n.theme).filter(Boolean))].slice(-8), [notes])

  function mark(kind: NoteKind) {
    const v = videoRef.current
    if (!v || !active) return
    const n = newNote(matchLabel, active.key, v.currentTime, kind)
    setNotes(ns => [...ns, n])
    setToast(`${KIND_UI[kind].label}を記録  ${fmt(v.currentTime)}`)
    setTimeout(() => setToast(''), 1400)
    setEditing(n)
  }

  if (sources.length === 0) {
    return (
      <Card className="text-center py-12 px-6 space-y-3">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-raised border border-line grid place-items-center text-3xl text-cyan"><IconVideo /></div>
        <p className="text-muted">「マーク」タブで動画を選ぶと、ここで見返しながら記録できます</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 [scrollbar-width:none]">
        {sources.map((s, i) => (
          <button key={s.key} onClick={() => setActiveKey(s.key)}
            className={`shrink-0 h-9 px-4 rounded-full text-sm font-bold border transition ${s.key === active?.key ? 'bg-fg text-ink border-fg' : 'bg-surface text-muted border-line'}`}>
            {i + 1}. {s.name}
          </button>
        ))}
      </div>

      <div className="-mx-5 sm:mx-0 sm:rounded-2xl overflow-hidden bg-black border-y sm:border border-line">
        {url ? (
          <video ref={videoRef} src={url} playsInline controls className="w-full aspect-video" />
        ) : (
          <div className="aspect-video grid place-items-center text-muted text-sm">「マーク」で動画を選び直してください</div>
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

      {editing && (
        <NoteEditor note={editing} themes={themes}
          onChange={n => { setNotes(ns => ns.map(x => x.id === n.id ? n : x)); setEditing(n) }}
          onDelete={() => { setNotes(ns => ns.filter(x => x.id !== editing.id)); setEditing(null) }}
          onClose={() => setEditing(null)} />
      )}
      <Toast text={toast} />
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

function BrowsePane({ notes, setNotes }: { notes: ReflectionNote[]; setNotes: (f: (n: ReflectionNote[]) => ReflectionNote[]) => void }) {
  const [themeFilter, setThemeFilter] = useState<string | null>(null)
  const themes = useMemo(() => [...new Set(notes.map(n => n.theme).filter(Boolean))], [notes])
  const shown = [...notes].filter(n => !themeFilter || n.theme === themeFilter).sort((a, b) => b.createdAt - a.createdAt)

  if (notes.length === 0) {
    return <Card className="text-center py-12 px-6 text-muted">まだメモがありません。「記録する」から始めてください</Card>
  }

  return (
    <div className="space-y-3">
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
      {themeFilter && <p className="text-xs text-muted px-1">「{themeFilter}」を時系列で並べています。同じテーマの変化を見比べてみてください</p>}
      <ol className="space-y-2.5">
        {shown.map(n => {
          const { Icon, label, cls } = KIND_UI[n.kind]
          return (
            <li key={n.id} className="bg-surface border border-line rounded-2xl p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1 text-xs font-black px-2 py-1 rounded-full ${cls}`}><Icon className="text-sm" />{label}</span>
                <button className="text-xs text-muted" onClick={() => setNotes(ns => ns.filter(x => x.id !== n.id))}>削除</button>
              </div>
              {n.theme && <p className="text-xs font-bold text-cyan">{n.theme}</p>}
              {n.note && <p className="text-sm">{n.note}</p>}
              <p className="text-[11px] text-muted">{n.matchLabel || '試合'}・{new Date(n.createdAt).toLocaleDateString('ja-JP')}</p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
