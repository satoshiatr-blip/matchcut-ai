import { useEffect, useState } from 'react'
import type { Tab } from '../App'
import { exportBackup, importBackup } from '../backup'
import { getStorageInfo, isStandalone, type StorageInfo } from '../storageInfo'
import { uid } from '../types'
import { IconPlus, IconTrash, IconUp } from './icons'
import { Button, Card, Field, FilePicker, GroupLabel, ScreenTitle, inputCls, type ProjectProps } from './ui'

const COLORS = ['#e13bff', '#3ee0ff', '#ff3b5c', '#22c55e', '#1a73ff', '#f97316', '#facc15', '#e5e7eb']
const GB = (n: number) => (n / 1e9).toFixed(1)

export default function SetupTab({ project, setProject, go, onStartNewMatch }: ProjectProps & { go: (t: Tab) => void; onStartNewMatch: () => void }) {
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  useEffect(() => { getStorageInfo().then(setStorage) }, [])
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function onImportBackup(files: FileList) {
    const f = files[0]
    if (!f) return
    if (!confirm('今のデータを上書きして復元します。よろしいですか？')) return
    const r = await importBackup(f)
    if (r.ok) {
      setImportMsg({ ok: true, text: '復元しました。反映のため再読み込みします…' })
      setTimeout(() => location.reload(), 600)
    } else {
      setImportMsg({ ok: false, text: r.error })
    }
  }
  const set = <K extends keyof typeof project>(k: K, v: (typeof project)[K]) => setProject(p => ({ ...p, [k]: v }))
  const updatePlayer = (id: string, patch: { number?: string; name?: string }) =>
    setProject(p => ({ ...p, players: p.players.map(x => x.id === id ? { ...x, ...patch } : x) }))

  return (
    <div className="space-y-6">
      <div className="relative -mx-5 -mt-5 mb-2 px-6 pt-8 pb-7 overflow-hidden border-b border-line bg-[radial-gradient(ellipse_at_70%_20%,rgba(26,115,255,0.45),transparent_60%)]">
        <div className="absolute -inset-1/2 speedlines opacity-60 animate-[spin-slow_90s_linear_infinite]" />
        <div className="relative">
          <p className="text-[11px] font-black italic tracking-[0.3em] text-cyan">PARENT CAM → PRO HIGHLIGHTS</p>
          <h2 className="mt-2 text-[34px] leading-[1.15] font-black italic -skew-x-6 origin-left">撮った試合を、<br /><span className="bg-gradient-to-r from-brand to-cyan bg-clip-text text-transparent">プロのハイライト</span>に。</h2>
          <ol className="mt-5 grid grid-cols-4 gap-2 text-center">
            {['試合', 'マーク', '仕上げ', '書き出し'].map((t, i) => (
              <li key={t} className="rise rounded-xl bg-ink/60 backdrop-blur border border-line py-2" style={{ animationDelay: `${120 + i * 70}ms` }}>
                <span className="block text-[10px] font-black italic text-cyan">0{i + 1}</span>
                <span className="text-xs font-bold">{t}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <ScreenTitle step="01" en="MATCH INFO" title="試合の情報" sub="オープニングとテロップに使います" />

      <div>
        <GroupLabel>試合</GroupLabel>
        <Card className="space-y-4">
          <Field label="大会名・試合名"><input className={inputCls} value={project.title} placeholder="例: 秋季リーグ 第3節" onChange={e => set('title', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="自チーム"><input className={inputCls} value={project.team} placeholder="〇〇FC" onChange={e => set('team', e.target.value)} /></Field>
            <Field label="対戦相手"><input className={inputCls} value={project.opponent} placeholder="△△SC" onChange={e => set('opponent', e.target.value)} /></Field>
          </div>
          <Field label="日付"><input type="date" className={inputCls} value={project.date} onChange={e => set('date', e.target.value)} /></Field>
        </Card>
      </div>

      <div>
        <GroupLabel>テーマカラー</GroupLabel>
        <Card>
          <div className="grid grid-cols-8 gap-2">
            {COLORS.map(c => (
              <button key={c} onClick={() => set('color', c)} aria-label={`色 ${c}`}
                className={`aspect-square rounded-full transition ${project.color === c ? 'ring-2 ring-offset-2 ring-offset-surface ring-fg scale-110' : ''}`}
                style={{ background: c, boxShadow: project.color === c ? `0 0 14px ${c}` : undefined }} />
            ))}
          </div>
        </Card>
      </div>

      <div>
        <div className="flex items-end justify-between">
          <GroupLabel>選手</GroupLabel>
          <span className="text-[11px] text-muted mb-2 px-1">自動で保存・次の試合でも使えます</span>
        </div>
        <Card className="space-y-2.5">
          {project.players.length === 0 && <p className="text-sm text-muted text-center py-2">背番号と名前がテロップに出ます。先頭の選手がシーンの初期値になります</p>}
          {project.players.map((pl, i) => (
            <div key={pl.id} className="flex gap-2 items-center">
              <input className={`${inputCls} !w-16 text-center font-black italic`} inputMode="numeric" placeholder="#" value={pl.number}
                onChange={e => updatePlayer(pl.id, { number: e.target.value })} />
              <input className={inputCls} placeholder="名前" value={pl.name} onChange={e => updatePlayer(pl.id, { name: e.target.value })} />
              {i === 0
                ? <span className="shrink-0 w-11 text-center text-[10px] font-black text-cyan">主役</span>
                : <button className="shrink-0 w-11 h-11 grid place-items-center rounded-xl text-muted text-lg" aria-label="先頭へ"
                    onClick={() => setProject(p => ({ ...p, players: [pl, ...p.players.filter(x => x.id !== pl.id)] }))}><IconUp /></button>}
              <button className="shrink-0 w-11 h-11 grid place-items-center rounded-xl text-danger text-lg" aria-label="削除"
                onClick={() => setProject(p => ({ ...p, players: p.players.filter(x => x.id !== pl.id) }))}><IconTrash /></button>
            </div>
          ))}
          <Button className="w-full border-dashed" onClick={() => setProject(p => ({ ...p, players: [...p.players, { id: uid(), number: '', name: '' }] }))}>
            <IconPlus /> 選手を追加
          </Button>
        </Card>
      </div>

      {project.sources.length > 0 && (
        <div>
          <GroupLabel>保存している動画</GroupLabel>
          <Card className="space-y-2">
            <div>
              <p className="text-sm font-bold">{project.sources.length}本・約{GB(project.sources.reduce((a, s) => a + s.size, 0))}GB</p>
              <p className="text-xs text-muted mt-0.5">アプリを開き直しても選び直さなくて済むよう、端末に保存しています</p>
            </div>
            {storage?.persisted === false && !isStandalone() && (
              <p className="text-[11px] text-amber-300/90 border-t border-line pt-2">
                Safariのタブのままだと消えやすい状態です。共有ボタン→「ホーム画面に追加」から開くと消えにくくなります
              </p>
            )}
          </Card>
        </div>
      )}

      <Button variant="primary" className="w-full min-h-14 text-lg" onClick={() => go('mark')}>次へ：動画を選ぶ</Button>

      <div>
        <GroupLabel>データのバックアップ</GroupLabel>
        <Card className="space-y-3">
          <p className="text-xs text-muted">振り返り・選手名簿・試合設定をファイルに書き出せます（動画本体は含みません）</p>
          <div className="grid grid-cols-2 gap-2">
            <Button className="min-h-11" onClick={exportBackup}>書き出す</Button>
            <FilePicker accept="application/json" multiple={false} onFiles={onImportBackup} className="min-h-11 rounded-xl border border-line">復元する</FilePicker>
          </div>
          {importMsg && <p className={`text-xs ${importMsg.ok ? 'text-emerald-400' : 'text-danger'}`}>{importMsg.text}</p>}
        </Card>
      </div>

      <button className="w-full py-3 text-sm text-danger/80" onClick={onStartNewMatch}>新しい試合を始める</button>
    </div>
  )
}
