import { useCallback, useEffect, useRef, useState } from 'react'

interface Draft {
  name: string
  content: string
  saved: string
}

/** Keeps reads scoped to one file and serializes autosaves, including a final save before switching. */
export function useNotebookDocument(active: string | null, visible: boolean) {
  const draft = useRef<Draft | null>(null)
  const writes = useRef(Promise.resolve())
  const pending = useRef(0)
  const [content, setContent] = useState('')
  const [loaded, setLoaded] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)

  const flush = useCallback(async (): Promise<void> => {
    const doc = draft.current
    if (!doc) return
    const text = doc.content
    pending.current++
    const save = writes.current.catch(() => undefined).then(async () => {
      if (doc.saved === text) return
      if (draft.current === doc) setStatus('Saving…')
      try {
        await window.notebook.write(doc.name, text)
        doc.saved = text
        if (draft.current === doc) {
          setStatus(doc.content === text ? 'Saved' : 'Unsaved changes')
          setError(null)
        }
      } catch (e) {
        if (draft.current === doc) {
          setStatus('Not saved')
          setError(e instanceof Error ? e.message : 'Could not save this note.')
        }
        throw e
      }
    })
    writes.current = save
    try {
      await save
    } finally {
      pending.current--
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    draft.current = null
    setLoaded(null)
    setContent('')
    setError(null)
    setStatus(active ? 'Loading…' : '')
    if (active) {
      window.notebook.read(active).then((text) => {
        if (cancelled) return
        draft.current = { name: active, content: text, saved: text }
        setContent(text)
        setLoaded(active)
        setStatus('Saved')
      }).catch((e: unknown) => {
        if (cancelled) return
        setStatus('Could not load note')
        setError(e instanceof Error ? e.message : 'Could not load this note.')
      })
    }
    return () => { cancelled = true }
  }, [active])

  const edit = useCallback((text: string): void => {
    const doc = draft.current
    if (!doc) return
    doc.content = text
    setContent(text)
    setStatus(doc.content === doc.saved ? 'Saved' : 'Unsaved changes')
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => { void flush().catch(() => undefined) }, 600)
    return () => clearTimeout(timer)
  }, [content, active, flush])

  useEffect(() => {
    if (!visible) void flush().catch(() => undefined)
  }, [visible, flush])

  useEffect(() => {
    // Keep a closing window alive long enough for its last IPC write. A failed save keeps the
    // editor open, with the draft and error visible, rather than silently dropping the text.
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      const doc = draft.current
      if (!doc || (doc.content === doc.saved && pending.current === 0)) return
      event.preventDefault()
      event.returnValue = ''
      void flush().then(() => {
        if (draft.current === doc && doc.content === doc.saved) window.close()
      }).catch(() => undefined)
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      void flush().catch(() => undefined)
    }
  }, [flush])

  return { content, edit, flush, ready: active != null && loaded === active, status, error }
}
