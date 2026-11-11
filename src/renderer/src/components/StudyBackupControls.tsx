import { useState } from 'react'
import { studyStorageKey } from '../lib/studyPreferences'

export default function StudyBackupControls(): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  async function run(restore: boolean) {
    setBusy(true)
    setStatus('')
    try {
      const state = localStorage.getItem(studyStorageKey())
      if (restore) await window.api.restoreStudyBackup(state)
      else {
        const path = await window.api.createStudyBackup(state)
        if (path) setStatus(`Backup saved to ${path}`)
      }
    } catch (e) { setStatus(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  return (
    <section className="mt-5 rounded-lg border border-line bg-elevated p-3">
      <h3 className="text-sm font-medium">Study backup</h3>
      <p className="text-xs text-muted mt-1">Save your annotations, bookmarks, learning progress, translations, Markdown files in the selected notebook folder, assistant documents, conversations, and reading settings.</p>
      <div className="flex gap-3 mt-2">
        <button disabled={busy} onClick={() => void run(false)} className="rounded-md border border-line px-3 py-1 text-sm">Save backup…</button>
        <button disabled={busy} onClick={() => void run(true)} className="rounded-md border border-line px-3 py-1 text-sm">Restore backup…</button>
      </div>
      {status && <p role="status" className="mt-2 text-xs break-words">{status}</p>}
    </section>
  )
}
