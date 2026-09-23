import { useState } from 'react'
import { useProject } from './store'
import type { SourceMeta } from './types'
import { sourceKey } from './types'
import SetupTab from './components/SetupTab'
import MarkTab from './components/MarkTab'
import ScenesTab from './components/ScenesTab'
import ExportTab from './components/ExportTab'
import { IconExport, IconFlag, IconLayers, IconTarget } from './components/icons'
import { Logo, Wordmark } from './components/brand'

export type Tab = 'setup' | 'mark' | 'scenes' | 'export'
const TABS = [
  { id: 'setup', label: '試合', Icon: IconFlag },
  { id: 'mark', label: 'マーク', Icon: IconTarget },
  { id: 'scenes', label: 'シーン', Icon: IconLayers },
  { id: 'export', label: '書き出し', Icon: IconExport },
] as const

function readDuration(f: File) {
  return new Promise<number>(resolve => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => { resolve(v.duration); URL.revokeObjectURL(v.src) }
    v.onerror = () => resolve(0)
    v.src = URL.createObjectURL(f)
  })
}

export default function App() {
  const [project, setProject] = useProject()
  const [files, setFiles] = useState<Map<string, File>>(new Map())
  const [tab, setTab] = useState<Tab>(project.sources.length ? 'mark' : 'setup')

  const go = (t: Tab) => { setTab(t); window.scrollTo({ top: 0 }) }

  async function addFiles(list: FileList) {
    const next = new Map(files)
    const metas: SourceMeta[] = []
    for (const f of Array.from(list)) {
      const key = sourceKey(f)
      next.set(key, f)
      metas.push({ key, name: f.name, size: f.size, duration: await readDuration(f) })
    }
    setFiles(next)
    setProject(p => {
      const known = new Set(p.sources.map(s => s.key))
      return { ...p, sources: [...p.sources, ...metas.filter(m => !known.has(m.key))] }
    })
  }

  function removeSource(key: string) {
    if (!confirm('この動画と、その中のシーンを外しますか？')) return
    setProject(p => ({ ...p, sources: p.sources.filter(s => s.key !== key), scenes: p.scenes.filter(s => s.sourceKey !== key) }))
  }

  return (
    <div className="min-h-svh bg-ink text-fg">
      <header className="sticky top-0 z-30 bg-ink/85 backdrop-blur-xl border-b border-line px-5 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Logo size={38} />
          <div className="min-w-0">
            <h1 className="text-lg"><Wordmark /></h1>
            <p className="text-xs text-muted truncate">{project.title ? `${project.title}${project.opponent ? `  VS ${project.opponent}` : ''}` : '試合のハイライトをつくる'}</p>
          </div>
        </div>
      </header>

      <main key={tab} className="rise max-w-2xl mx-auto px-5 pt-5 pb-36">
        {tab === 'setup' && <SetupTab project={project} setProject={setProject} go={go} />}
        {tab === 'mark' && <MarkTab project={project} setProject={setProject} files={files} addFiles={addFiles} removeSource={removeSource} go={go} />}
        {tab === 'scenes' && <ScenesTab project={project} setProject={setProject} files={files} go={go} />}
        {tab === 'export' && <ExportTab project={project} setProject={setProject} files={files} addFiles={addFiles} />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-30 bg-surface/90 backdrop-blur-xl border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-2xl mx-auto grid grid-cols-4">
          {TABS.map(({ id, label, Icon }, i) => {
            const active = tab === id
            return (
              <button key={id} onClick={() => go(id)} className={`relative flex flex-col items-center gap-1 pt-2.5 pb-2 transition ${active ? 'text-cyan' : 'text-muted'}`}>
                {active && <span className="absolute top-0 h-0.5 w-10 rounded-full bg-cyan shadow-[0_0_10px_#3ee0ff]" />}
                <span className="relative text-2xl">
                  <Icon />
                  {id === 'scenes' && project.scenes.length > 0 && (
                    <span className="absolute -top-1.5 -right-3 min-w-5 h-5 px-1 rounded-full bg-brand text-white text-[11px] font-bold grid place-items-center">{project.scenes.length}</span>
                  )}
                </span>
                <span className="text-[11px] font-bold"><span className="opacity-50 mr-0.5">0{i + 1}</span>{label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
