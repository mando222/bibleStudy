import { useEffect, useRef, useState } from 'react'
import type { AiDoc, AiStatus, ChatCitation } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { SparkleIcon, SendIcon, FileIcon } from './icons'

interface Msg {
  role: 'user' | 'assistant'
  content: string
  citations?: ChatCitation[]
}

export default function ChatDrawer(): JSX.Element {
  const open = useAppStore((s) => s.assistantOpen)
  const setOpen = useAppStore((s) => s.setAssistantOpen)
  const primary = useAppStore((s) => s.primary)
  const goToVerse = useAppStore((s) => s.goToVerse)

  const [status, setStatus] = useState<AiStatus | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [ground, setGround] = useState(true)
  const [showDocs, setShowDocs] = useState(false)
  const [docs, setDocs] = useState<AiDoc[]>([])
  const [docBusy, setDocBusy] = useState(false)
  const [docErr, setDocErr] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const loadDocs = (): void => {
    window.ai
      ?.listDocuments()
      .then(setDocs)
      .catch(() => undefined)
  }
  const importDoc = async (): Promise<void> => {
    setDocErr(null)
    setDocBusy(true)
    try {
      const d = await window.ai.importDocument()
      if (d) loadDocs()
    } catch (e) {
      setDocErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDocBusy(false)
    }
  }
  const toggleDoc = async (id: string, active: boolean): Promise<void> => {
    await window.ai.setDocumentActive(id, active)
    loadDocs()
  }
  const removeDoc = async (id: string): Promise<void> => {
    await window.ai.deleteDocument(id)
    loadDocs()
  }
  const activeDocs = docs.filter((d) => d.active).length

  const refreshStatus = (): void => {
    window.ai
      ?.status()
      .then(setStatus)
      .catch(() => setStatus(null))
  }
  useEffect(() => {
    refreshStatus()
    loadDocs()
    const unsub = window.ai?.onToken((ev) => {
      setMessages((prev) => {
        if (!prev.length) return prev
        const copy = [...prev]
        const last = { ...copy[copy.length - 1] }
        if (last.role !== 'assistant') return prev
        if (ev.citations) last.citations = ev.citations
        if (ev.token) last.content += ev.token
        if (ev.error) last.content += `\n\n⚠️ ${ev.error}`
        copy[copy.length - 1] = last
        return copy
      })
      if (ev.done) setBusy(false)
    })
    return unsub
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const send = async (): Promise<void> => {
    const q = input.trim()
    if (!q || busy || !window.ai) return
    setInput('')
    const history = [...messages.map((m) => ({ role: m.role, content: m.content })), {
      role: 'user' as const,
      content: q
    }]
    setMessages((prev) => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '' }])
    setBusy(true)
    try {
      await window.ai.chat(history, ground ? { translation: primary } : null)
    } catch (e) {
      setBusy(false)
      setMessages((prev) => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        if (last?.role === 'assistant') last.content += `\n\n⚠️ ${e instanceof Error ? e.message : e}`
        return copy
      })
    }
  }

  const setModel = (m: string): void => {
    window.ai?.setConfig({ chatModel: m }).then(() => refreshStatus())
  }

  return (
    <div
      className={`fixed inset-y-0 right-0 z-40 w-[440px] max-w-[92vw] bg-panel border-l border-line shadow-2xl flex flex-col transition-transform duration-200 ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="h-12 shrink-0 border-b border-line px-3 flex items-center gap-2">
        <SparkleIcon className="w-5 h-5 text-accent" />
        <span className="font-semibold text-sm text-ink">Assistant</span>
        {status?.available && status.models.length > 0 && (
          <select
            value={status.config.chatModel}
            onChange={(e) => setModel(e.target.value)}
            className="ml-1 bg-elevated border border-line rounded-md text-xs px-1.5 py-1 text-muted max-w-[150px]"
          >
            {status.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setShowDocs((v) => !v)}
          className={`flex items-center gap-1 text-xs px-1.5 py-1 rounded-md ${
            showDocs ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-elevated'
          }`}
          title="Documents used as context"
        >
          <FileIcon className="w-3.5 h-3.5" />
          {activeDocs > 0 && <span className="tabular-nums">{activeDocs}</span>}
        </button>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="text-xs text-muted hover:text-accent px-2"
          >
            Clear
          </button>
        )}
        <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-md text-muted hover:bg-elevated">
          ✕
        </button>
      </div>

      {showDocs && status?.available && (
        <div className="border-b border-line p-3 bg-elevated/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider text-faint">
              Documents · used as context
            </span>
            <button
              onClick={() => void importDoc()}
              disabled={docBusy}
              className="text-xs text-accent hover:underline disabled:opacity-50"
            >
              {docBusy ? 'Adding…' : '+ Add document…'}
            </button>
          </div>
          {docErr && <div className="text-xs text-red-500 mb-1">{docErr}</div>}
          {docs.length === 0 ? (
            <p className="text-xs text-muted leading-relaxed">
              Add your notes or a position paper (PDF, txt, md). Checked documents are retrieved and
              fed to the assistant as context.
            </p>
          ) : (
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={d.active}
                    onChange={(e) => void toggleDoc(d.id, e.target.checked)}
                  />
                  <span className="flex-1 truncate text-ink" title={d.name}>
                    {d.name}
                  </span>
                  <span className="text-[11px] text-faint tabular-nums" title="chunks">
                    {d.chunks}
                  </span>
                  <button
                    onClick={() => void removeDoc(d.id)}
                    className="text-xs text-muted hover:text-red-500"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {status && !status.available ? (
        <Setup onRetry={refreshStatus} />
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 ? (
              <div className="mt-8 text-center text-muted text-sm px-4 leading-relaxed">
                <SparkleIcon className="w-8 h-8 mx-auto text-faint mb-3" />
                Ask about a passage, a word, or where a theme appears. Answers are grounded in the{' '}
                <span className="text-accent">{primary}</span> and cite the verses they use.
              </div>
            ) : (
              messages.map((m, i) => (
                <Bubble key={i} m={m} goToVerse={goToVerse} />
              ))
            )}
            {busy && <div className="text-xs text-faint px-1">Thinking…</div>}
          </div>

          <div className="border-t border-line p-2.5">
            <label className="flex items-center gap-1.5 text-xs text-muted mb-2 select-none">
              <input type="checkbox" checked={ground} onChange={(e) => setGround(e.target.checked)} />
              Ground answers in Scripture ({primary})
            </label>
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                placeholder="Ask a question…"
                rows={2}
                className="flex-1 resize-none rounded-md border border-line bg-elevated p-2 text-sm text-ink outline-none focus:border-accent"
              />
              <button
                onClick={() => void send()}
                disabled={busy || !input.trim()}
                className="h-9 w-9 shrink-0 rounded-md bg-accent text-white flex items-center justify-center disabled:opacity-40"
              >
                <SendIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Bubble({
  m,
  goToVerse
}: {
  m: Msg
  goToVerse: (b: string, c: number, v: number) => void
}): JSX.Element {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent-soft text-ink px-3 py-2 text-sm whitespace-pre-wrap">
          {m.content}
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%]">
        <div className="rounded-2xl rounded-bl-sm bg-elevated text-ink px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed">
          {m.content || '…'}
        </div>
        {m.citations && m.citations.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {m.citations.slice(0, 8).map((c, i) => (
              <button
                key={i}
                onClick={() => goToVerse(c.book, c.chapter, c.verse)}
                title={c.text}
                className="text-[11px] px-1.5 py-0.5 rounded-md border border-line text-accent hover:bg-accent-soft"
              >
                {c.source ? c.source : `${c.bookName} ${c.chapter}:${c.verse}`}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Setup({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-sm text-muted">
      <SparkleIcon className="w-9 h-9 text-faint mb-3" />
      <p className="text-ink font-medium">AI isn&rsquo;t connected</p>
      <p className="mt-1 max-w-xs leading-relaxed">
        The assistant runs locally through <span className="text-accent">Ollama</span>. Install it
        from ollama.com, then start it and pull a model:
      </p>
      <pre className="mt-3 text-xs bg-elevated border border-line rounded-md p-2 text-ink text-left">
        ollama serve{'\n'}ollama pull llama3.1
      </pre>
      <button
        onClick={onRetry}
        className="mt-4 px-3 py-1.5 rounded-md bg-accent text-white text-sm hover:opacity-90"
      >
        Retry
      </button>
    </div>
  )
}
