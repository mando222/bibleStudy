import ModalDialog from './ModalDialog'
import { useEffect, useState } from 'react'
import { TRANSLATIONS, ORIGINALS, DERIVED, STUDY_DATA, LEARN, type Source } from '@shared/dataCredits'
import type { UpdateInfo } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import StudyBackupControls from './StudyBackupControls'
import { BookIcon } from './icons'

const AI: Source[] = [
  { what: 'Llama 3.2 (1B / 3B) Instruct', detail: 'Assistant — downloaded on demand', license: 'Llama 3.2 Community License — Meta', url: 'https://huggingface.co/meta-llama' },
  { what: 'Qwen2.5 7B Instruct', detail: 'Assistant (Quality tier)', license: 'Apache 2.0 — Alibaba', url: 'https://huggingface.co/Qwen' },
  { what: 'Nomic Embed Text v1.5', detail: 'Embeddings for semantic search', license: 'Apache 2.0 — Nomic AI', url: 'https://huggingface.co/nomic-ai' }
]

interface UpdateControls {
  update: UpdateInfo | null
  onChecked: (info: UpdateInfo | null) => void
  onViewUpdate: () => void
}

export default function AboutModal({ update, onChecked, onViewUpdate }: UpdateControls): JSX.Element | null {
  const open = useAppStore((s) => s.aboutOpen)
  const setOpen = useAppStore((s) => s.setAboutOpen)
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.api
      ?.version()
      .then(setVersion)
      .catch(() => undefined)
  }, [])

  if (!open) return null

  return (
    <ModalDialog label="About & credits" className="w-[min(42rem,90vw)]" close={() => setOpen(false)}>
        <div className="sticky top-0 bg-panel border-b border-line px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-accent">
            <BookIcon className="w-5 h-5" />
            <span className="font-semibold text-ink">Open Bible Study</span>
            {version && <span className="text-xs text-faint tabular-nums">v{version}</span>}
          </div>
          <button aria-label="Close About"
            onClick={() => setOpen(false)}
            className="w-7 h-7 rounded-md text-muted hover:bg-elevated hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 text-sm text-ink leading-relaxed">
          <p className="text-muted">
            A local, offline, open-source Bible study app. The application code is MIT-licensed.
            Bundled texts and lexicons retain their own licenses, credited below.
          </p>

          <LibrarySettings update={update} onChecked={onChecked} onViewUpdate={() => {
            setOpen(false)
            queueMicrotask(onViewUpdate)
          }} />
          <SourceWordNote />

          <Section title="Translations">
            {TRANSLATIONS.map((s) => (
              <SourceRow key={s.what} s={s} />
            ))}
          </Section>

          <Section title="Original languages & lexicons">
            {ORIGINALS.map((s) => (
              <SourceRow key={s.what} s={s} />
            ))}
          </Section>

          <Section title="Derived word mappings (inferred, not scholarship)">
            {DERIVED.map((s) => (
              <SourceRow key={s.what} s={s} />
            ))}
          </Section>

          <Section title="Study data (people · places · events)">
            {STUDY_DATA.map((s) => (
              <SourceRow key={s.what} s={s} />
            ))}
          </Section>

          <Section title="Learn (Greek & Hebrew)">
            {LEARN.map((s) => (
              <SourceRow key={s.what} s={s} />
            ))}
          </Section>

          <Section title="AI assistant (optional, downloaded on demand)">
            {AI.map((s) => (
              <SourceRow key={s.what} s={s} />
            ))}
          </Section>

          <p className="mt-5 text-xs text-faint">
            NKJV and NASB are copyrighted and are not included. Corrections to CC-BY data should go
            upstream to the respective projects.
          </p>
        </div>
    </ModalDialog>
  )
}

export function LibrarySettings({ update, onChecked, onViewUpdate }: UpdateControls): JSX.Element {
  const translations = useAppStore((s) => s.translations)
  const setTranslations = useAppStore((s) => s.setTranslations)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const imported = translations.filter((t) => t.language === 'imported')

  const refresh = async (): Promise<void> => {
    const list = await window.api.listTranslations()
    setTranslations(list)
  }
  const doImport = async (): Promise<void> => {
    setBusy(true)
    setStatus(null)
    try {
      const res = await window.api.importTranslation()
      if (res) {
        await refresh()
        setStatus(`Imported ${res.name} (${res.verseCount.toLocaleString()} verses).`)
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }
  const remove = async (id: string): Promise<void> => {
    await window.api.deleteImportedTranslation(id)
    await refresh()
  }

  return <>
          <UpdateSetting
            update={update}
            onChecked={onChecked}
            onViewUpdate={onViewUpdate}
          />
          <StudyBackupControls />

          <div className="mt-5 rounded-lg border border-line bg-elevated p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-ink">Your translations</div>
                <div className="text-xs text-muted">
                  Load a module you legally own — MySword (.mybible) or e-Sword (.bblx/.bbli). NKJV
                  and NASB are copyrighted, so import a copy you own (we can&rsquo;t bundle or
                  download them).
                </div>
              </div>
              <button
                onClick={doImport}
                disabled={busy}
                className="px-3 py-1.5 rounded-md bg-accent text-white text-sm hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
              >
                {busy ? 'Importing…' : 'Import…'}
              </button>
            </div>
            <div className="mt-2 text-xs text-faint">
              Where to get them (you must own a copy):{' '}
              <LinkBtn url="https://www.lockman.org">NASB · Lockman</LinkBtn> ·{' '}
              <LinkBtn url="https://www.thomasnelsonbibles.com">NKJV · Thomas Nelson</LinkBtn> ·{' '}
              <LinkBtn url="https://www.e-sword.net">e-Sword</LinkBtn> ·{' '}
              <LinkBtn url="https://www.mysword.info">MySword</LinkBtn>
            </div>
            {status && <div role="status" className="mt-2 text-xs text-muted">{status}</div>}
            {imported.length > 0 && (
              <ul className="mt-2 space-y-1">
                {imported.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between text-sm border-t border-line/60 pt-1.5"
                  >
                    <span className="text-ink">
                      {t.name} <span className="text-faint">({t.abbrev})</span>
                    </span>
                    <button
                      onClick={() => remove(t.id)}
                      className="text-xs text-muted hover:text-red-500"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

  </>
}

function SourceWordNote(): JSX.Element {
  return (
    <div className="mt-5 rounded-lg border border-line bg-elevated p-3">
      <div className="text-sm font-medium text-ink">Source word restoration</div>
      <p className="mt-1 text-xs text-muted">
        Select a word in the reader to show its written form at verified occurrences. The
        right-hand lexicon panel identifies the source row for the selected verse. Forms follow
        the cited textual edition. Other manuscripts can have different readings. When several
        words share a translation phrase, the reader keeps the phrase alongside the source form.
        The toolbar also offers transliterated terms. The verified four-letter Hebrew name
        appears as YHWH. Hover over a restored word to see how the current translation prints it.
        Select Compare translations for other editions. Copies and assistant
        selections quote the published text.
      </p>
    </div>
  )
}

function LinkBtn({ url, children }: { url: string; children: React.ReactNode }): JSX.Element {
  return (
    <button onClick={() => window.open(url, '_blank')} className="text-accent hover:underline">
      {children}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="mt-5">
      <div className="text-[11px] uppercase tracking-wider text-faint mb-2">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function SourceRow({ s }: { s: Source }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-2">
      <div>
        <button
          onClick={() => window.open(s.url, '_blank')}
          className="text-ink hover:text-accent hover:underline font-medium text-left"
        >
          {s.what}
        </button>
        <span className="text-muted"> — {s.detail}</span>
      </div>
      <span className="text-xs text-faint whitespace-nowrap">{s.license}</span>
    </div>
  )
}

function UpdateSetting({ update, onChecked, onViewUpdate }: UpdateControls): JSX.Element {
  const [on, setOn] = useState(true)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    window.updates
      ?.getPrefs()
      .then((p) => setOn(p.checkOnLaunch))
      .catch(() => undefined)
  }, [])

  const toggle = async (next: boolean): Promise<void> => {
    setOn(next)
    setResult(null)
    await window.updates?.setPrefs({ checkOnLaunch: next }).catch(() => undefined)
  }

  const checkNow = async (): Promise<void> => {
    setChecking(true)
    setResult(null)
    try {
      if (!window.updates) {
        setResult('Update checks are unavailable in this window.')
        return
      }
      const info = await window.updates.check(true)
      onChecked(info)
      if (!info) setResult('You’re on the latest version.')
    } catch {
      setResult('Couldn’t check the latest release on GitHub. Try again later.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="mt-5 rounded-lg border border-line bg-elevated p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-ink">Check for updates</div>
          <div className="text-xs text-muted">
            With On launch enabled, the app checks GitHub for new releases and remembers a
            successful check for a day. You can check manually at any time. To install a
            release, download the installer and open it from your Downloads folder.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => void checkNow()}
            disabled={checking}
            className="px-2.5 py-1 rounded-md border border-line text-xs text-muted hover:bg-panel disabled:opacity-50 whitespace-nowrap"
          >
            {checking ? 'Checking…' : 'Check now'}
          </button>
          <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={on}
              onChange={(e) => void toggle(e.target.checked)}
              className="accent-accent"
            />
            On launch
          </label>
        </div>
      </div>
      <div role="status" className="text-xs text-accent">
        {result ? <p className="mt-2">{result}</p> : update && !checking && (
          <p className="mt-2">
            Version {update.latest} is available.{' '}
            <button onClick={onViewUpdate} className="underline">View download options</button>
          </p>
        )}
      </div>
    </div>
  )
}
