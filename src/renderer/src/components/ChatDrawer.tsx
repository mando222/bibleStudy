import { useEffect, useRef, useState } from 'react'
import type { AiDoc, AiIndexStatus, AiSetupProgress, AiStatus, ChatCitation } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { BOOK_BY_ID } from '@shared/books'
import { SparkleIcon, SendIcon, FileIcon } from './icons'
import LinkedScripture from './LinkedScripture'

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
  const pendingContext = useAppStore((s) => s.pendingContext)
  const clearPendingContext = useAppStore((s) => s.clearPendingContext)
  const savedChat = useAppStore((s) => s.chatMessages)
  const persistChat = useAppStore((s) => s.setChatMessages)
  // Live "what am I looking at" context, so the assistant can resolve "this verse" / "here".
  const activity = useAppStore((s) => s.activity)
  const book = useAppStore((s) => s.book)
  const chapter = useAppStore((s) => s.chapter)
  const activeVerse = useAppStore((s) => s.activeVerse)
  const activePlace = useAppStore((s) => s.activePlace)
  const activePerson = useAppStore((s) => s.activePerson)
  const activeEvent = useAppStore((s) => s.activeEvent)

  const buildActiveContext = (): string | undefined => {
    const parts: string[] = []
    const bookName = BOOK_BY_ID[book]?.name ?? book
    parts.push(`Open passage: ${bookName} ${chapter}${activeVerse ? `:${activeVerse}` : ''}`)
    if (activity === 'maps' && activePlace) parts.push(`Selected place: ${activePlace.name}`)
    if (activity === 'genealogies' && activePerson)
      parts.push(`Selected person: ${activePerson.name}`)
    if (activity === 'timelines' && activeEvent) parts.push(`Selected event: ${activeEvent.name}`)
    return parts.join('. ') || undefined
  }

  const [status, setStatus] = useState<AiStatus | null>(null)
  const [messages, setMessages] = useState<Msg[]>(() => savedChat)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  // A stable id per conversation so the main process can keep a KV-cached session and cancel it.
  const [convId, setConvId] = useState(() => `c_${Date.now().toString(36)}`)
  const newConversation = (): void => {
    setConvId(`c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`)
    setMessages([])
  }
  const stop = (): void => void window.ai?.stop(convId)
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

  const [idx, setIdx] = useState<AiIndexStatus | null>(null)
  useEffect(() => {
    window.ai
      ?.indexStatus(primary)
      .then(setIdx)
      .catch(() => undefined)
    const unsub = window.ai?.onIndexProgress(setIdx)
    return unsub
  }, [primary])
  const indexDone = !!idx && idx.bibleTotal > 0 && idx.bibleIndexed >= idx.bibleTotal && !idx.stale
  const indexPct = idx && idx.bibleTotal ? Math.round((100 * idx.bibleIndexed) / idx.bibleTotal) : 0

  const refreshStatus = (): void => {
    window.ai
      ?.status()
      .then(setStatus)
      .catch(() => setStatus(null))
  }

  const [setupBusy, setSetupBusy] = useState(false)
  const [setupProg, setSetupProg] = useState<AiSetupProgress | null>(null)
  const runSetup = async (): Promise<void> => {
    if (setupBusy || !window.ai) return
    setSetupProg(null)
    setSetupBusy(true)
    try {
      await window.ai.setupBundled()
    } finally {
      setSetupBusy(false)
      refreshStatus()
      // Build the semantic Bible index in the background so "search by meaning" just works.
      window.ai
        ?.indexStatus(primary)
        .then((s) => {
          const done = s.bibleTotal > 0 && s.bibleIndexed >= s.bibleTotal && !s.stale
          if (!done && !s.building) void window.ai?.buildBibleIndex(primary)
        })
        .catch(() => undefined)
    }
  }

  // Switch the bundled model tier; download it on demand if not already present.
  const changeTier = async (tier: string): Promise<void> => {
    if (!window.ai) return
    await window.ai.setConfig({ chatTier: tier as never })
    const st = await window.ai.status()
    setStatus(st)
    const needDownload = tier !== 'auto' && !st.installedTiers.includes(tier as never)
    if (needDownload) await runSetup()
  }

  useEffect(() => {
    refreshStatus()
    loadDocs()
    const unsubSetup = window.ai?.onSetupProgress(setSetupProg)
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
    return () => {
      unsub?.()
      unsubSetup?.()
    }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  // Persist the transcript once a turn settles (not on every streamed token).
  useEffect(() => {
    if (!busy) persistChat(messages)
  }, [busy, messages, persistChat])

  // Re-run the last question, replacing its answer.
  const regenerate = async (): Promise<void> => {
    if (busy || !window.ai) return
    let idx = messages.length - 1
    while (idx >= 0 && messages[idx].role !== 'user') idx--
    if (idx < 0) return
    const history = messages.slice(0, idx + 1).map((m) => ({ role: m.role, content: m.content }))
    setMessages([...messages.slice(0, idx + 1), { role: 'assistant', content: '' }])
    setBusy(true)
    try {
      await window.ai.chat(
        convId,
        history,
        ground ? { translation: primary } : null,
        [],
        buildActiveContext()
      )
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
    // Include the selected passage (if any) as extra context, then consume it.
    const extra = pendingContext
      ? [
          {
            book: pendingContext.book,
            bookName: pendingContext.bookName,
            chapter: pendingContext.chapter,
            verse: pendingContext.verse,
            text: pendingContext.text
          }
        ]
      : []
    clearPendingContext()
    try {
      await window.ai.chat(
        convId,
        history,
        ground ? { translation: primary } : null,
        extra,
        buildActiveContext()
      )
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
        {status?.activeProvider === 'ollama' && status.models.length > 0 && (
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
        {status?.activeProvider === 'bundled' && (
          <select
            value={status.config.chatTier}
            onChange={(e) => void changeTier(e.target.value)}
            disabled={setupBusy}
            title={status.chatModelLabel ? `Running ${status.chatModelLabel}` : undefined}
            className="ml-1 bg-elevated border border-line rounded-md text-xs px-1.5 py-1 text-muted disabled:opacity-50"
          >
            <option value="auto">Auto</option>
            <option value="fast">Fast{status.installedTiers.includes('fast') ? '' : ' ↓'}</option>
            <option value="balanced">
              Balanced{status.installedTiers.includes('balanced') ? '' : ' ↓'}
            </option>
            <option value="quality">
              Quality{status.installedTiers.includes('quality') ? '' : ' ↓'}
            </option>
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
          <button onClick={newConversation} className="text-xs text-muted hover:text-accent px-2">
            Clear
          </button>
        )}
        <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-md text-muted hover:bg-elevated">
          ✕
        </button>
      </div>

      {setupBusy && status?.available && (
        <div className="shrink-0 border-b border-line px-3 py-2 bg-elevated/40">
          <div className="flex justify-between text-[11px] text-muted mb-1">
            <span>Downloading {setupProg?.label ?? 'model'}…</span>
            {setupProg && setupProg.total > 0 && (
              <span className="tabular-nums">
                {Math.round((100 * setupProg.received) / setupProg.total)}%
              </span>
            )}
          </div>
          <div className="h-1 rounded bg-line overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{
                width: `${setupProg && setupProg.total > 0 ? Math.round((100 * setupProg.received) / setupProg.total) : 0}%`
              }}
            />
          </div>
        </div>
      )}

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

          <div className="mt-3 pt-2 border-t border-line">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-faint">
                Semantic search · {primary}
              </span>
              {indexDone ? (
                <span className="text-xs text-accent">On ✓</span>
              ) : idx?.building ? (
                <span className="text-xs text-muted tabular-nums">Building… {indexPct}%</span>
              ) : (
                <button
                  onClick={() => void window.ai?.buildBibleIndex(primary)}
                  className="text-xs text-accent hover:underline"
                >
                  {idx?.stale ? 'Rebuild index' : 'Build index'}
                </button>
              )}
            </div>
            {idx?.building && (
              <div className="mt-1.5 h-1 rounded bg-line overflow-hidden">
                <div className="h-full bg-accent transition-all" style={{ width: `${indexPct}%` }} />
              </div>
            )}
            <p className="text-[11px] text-muted mt-1 leading-relaxed">
              Find verses by meaning, not just keywords. One-time; runs locally.
            </p>
          </div>
        </div>
      )}

      {status && !status.available ? (
        <Setup busy={setupBusy} progress={setupProg} onSetup={() => void runSetup()} />
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
                <Bubble
                  key={i}
                  m={m}
                  goToVerse={goToVerse}
                  onRegenerate={
                    m.role === 'assistant' && i === messages.length - 1 && !busy
                      ? regenerate
                      : undefined
                  }
                />
              ))
            )}
            {busy && <div className="text-xs text-faint px-1">Thinking…</div>}
          </div>

          <div className="border-t border-line p-2.5">
            {pendingContext && (
              <div className="mb-2 flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent-soft/40 px-2 py-1 text-xs">
                <SparkleIcon className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="text-accent font-medium shrink-0">About</span>
                <span className="text-muted truncate">
                  {pendingContext.bookName} {pendingContext.chapter}:{pendingContext.verse}
                  {pendingContext.endVerse ? `–${pendingContext.endVerse}` : ''}
                </span>
                <button
                  onClick={clearPendingContext}
                  title="Remove context"
                  className="ml-auto text-muted hover:text-accent shrink-0"
                >
                  ✕
                </button>
              </div>
            )}
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
              {busy ? (
                <button
                  onClick={stop}
                  title="Stop generating"
                  className="h-9 px-3 shrink-0 rounded-md border border-line text-xs font-medium text-muted hover:text-accent hover:border-accent flex items-center"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => void send()}
                  disabled={!input.trim()}
                  className="h-9 w-9 shrink-0 rounded-md bg-accent text-white flex items-center justify-center disabled:opacity-40"
                >
                  <SendIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Bubble({
  m,
  goToVerse,
  onRegenerate
}: {
  m: Msg
  goToVerse: (b: string, c: number, v: number) => void
  onRegenerate?: () => void
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
          {m.content ? <LinkedScripture text={m.content} /> : '…'}
        </div>
        {m.citations && m.citations.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {m.citations.slice(0, 8).map((c, i) => (
              <button
                key={i}
                onClick={() => (c.source ? undefined : goToVerse(c.book, c.chapter, c.verse))}
                title={c.text}
                className="text-[11px] px-1.5 py-0.5 rounded-md border border-line text-accent hover:bg-accent-soft"
              >
                {c.source ? c.source : `${c.bookName} ${c.chapter}:${c.verse}`}
              </button>
            ))}
          </div>
        )}
        {m.content && (
          <div className="flex gap-3 mt-1 px-1 text-[11px] text-faint">
            <button
              onClick={() => void navigator.clipboard?.writeText(m.content)}
              className="hover:text-accent"
            >
              Copy
            </button>
            {onRegenerate && (
              <button onClick={onRegenerate} className="hover:text-accent">
                Regenerate
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Setup({
  busy,
  progress,
  onSetup
}: {
  busy: boolean
  progress: AiSetupProgress | null
  onSetup: () => void
}): JSX.Element {
  const mb = (n: number): string => `${(n / 1_048_576).toFixed(0)} MB`
  const pct =
    progress && progress.total > 0 ? Math.min(100, Math.round((100 * progress.received) / progress.total)) : 0
  const err = progress?.error

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-sm text-muted">
      <SparkleIcon className="w-9 h-9 text-faint mb-3" />
      {busy ? (
        <>
          <p className="text-ink font-medium">Setting up the assistant…</p>
          <p className="mt-1 max-w-xs leading-relaxed">
            Getting things ready. This one-time step runs entirely on your computer.
          </p>
          <div className="mt-4 w-full max-w-xs">
            <div className="h-1.5 rounded bg-line overflow-hidden">
              <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-faint tabular-nums">
              <span>{pct}%</span>
              {progress && progress.total > 0 && (
                <span>
                  {mb(progress.received)} / {mb(progress.total)}
                </span>
              )}
            </div>
          </div>
        </>
      ) : err ? (
        <>
          <p className="text-ink font-medium">Setup didn&rsquo;t finish</p>
          <p className="mt-1 max-w-xs leading-relaxed text-red-500">{err}</p>
          <button
            onClick={onSetup}
            className="mt-4 px-3 py-1.5 rounded-md bg-accent text-white text-sm hover:opacity-90"
          >
            Try again
          </button>
        </>
      ) : (
        <>
          <p className="text-ink font-medium">Turn on the assistant</p>
          <p className="mt-1 max-w-xs leading-relaxed">
            Ask study questions and get answers grounded in the text you&rsquo;re reading. It runs
            privately on this computer and works offline — no account, no cloud.
          </p>
          <button
            onClick={onSetup}
            className="mt-4 px-4 py-2 rounded-md bg-accent text-white text-sm font-medium hover:opacity-90"
          >
            Set up the assistant
          </button>
          <p className="mt-2 text-[11px] text-faint">One-time setup · a few minutes</p>
        </>
      )}
    </div>
  )
}
