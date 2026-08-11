import { useEffect, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { BookIcon } from './icons'

interface Source {
  what: string
  detail: string
  license: string
  url: string
}

const TRANSLATIONS: Source[] = [
  { what: 'King James Version', detail: 'KJV (1769)', license: 'Public Domain', url: 'https://bible.helloao.org' },
  { what: 'Berean Standard Bible', detail: 'BSB — text + word alignment', license: 'Public Domain', url: 'https://berean.bible' },
  { what: 'World English Bible', detail: 'WEB', license: 'Public Domain', url: 'https://ebible.org' },
  { what: "Young's Literal Translation", detail: 'YLT (1898)', license: 'Public Domain', url: 'https://bible.helloao.org' },
  { what: 'Julia E. Smith Translation', detail: '1876 — text via studybible.info', license: 'Public Domain', url: 'https://studybible.info/JuliaSmith' }
]

const ORIGINALS: Source[] = [
  { what: 'Masoretic Hebrew (TAHOT)', detail: 'Amalgamated Hebrew OT', license: 'CC BY 4.0 — STEPBible / Tyndale House', url: 'https://github.com/STEPBible/STEPBible-Data' },
  { what: 'Greek NT editions (TAGNT)', detail: 'Critical / Textus Receptus / Byzantine', license: 'CC BY 4.0 — STEPBible / Tyndale House', url: 'https://github.com/STEPBible/STEPBible-Data' },
  { what: 'Septuagint (Greek OT)', detail: 'Swete — via Open Greek and Latin / First1KGreek', license: 'CC BY-SA 4.0 — nathans/lxx-swete', url: 'https://github.com/nathans/lxx-swete' },
  { what: "Strong's Greek & Hebrew lexicons", detail: 'Strong (1890/1894), JSON', license: 'CC BY-SA — OpenScriptures', url: 'https://github.com/openscriptures/strongs' },
  { what: 'Lexicons: BDB · Abbott-Smith · LSJ', detail: 'TBESH / TBESG / TFLSJ, keyed to Strong’s', license: 'CC BY 4.0 — STEPBible / Tyndale House', url: 'https://github.com/STEPBible/STEPBible-Data' },
  { what: "KJV Strong's word tagging", detail: 'kaiserlik/kjv', license: 'Open', url: 'https://github.com/kaiserlik/kjv' },
  { what: 'Verse-text distribution', detail: 'helloao Free Use Bible API', license: 'Open', url: 'https://bible.helloao.org' }
]

const STUDY_DATA: Source[] = [
  { what: 'People, places & events', detail: 'Genealogies, Maps & Timelines — with verse references', license: 'CC BY-SA 4.0 — Theographic Bible Metadata', url: 'https://github.com/robertrouse/theographic-bible-metadata' },
  { what: 'Place coordinates', detail: 'Biblical geocoding (via Theographic)', license: 'CC BY — OpenBible.info', url: 'https://www.openbible.info/geo/' },
  { what: "Easton's Bible Dictionary", detail: 'Public-domain person summaries', license: 'Public Domain (1897)', url: 'https://www.ccel.org/ccel/easton/ebd2.html' },
  { what: 'Map basemap', detail: 'Natural Earth 1:50m land polygons', license: 'Public Domain — naturalearthdata.com', url: 'https://www.naturalearthdata.com' },
  { what: 'Cross-references', detail: 'Treasury of Scripture Knowledge', license: 'CC BY — OpenBible.info', url: 'https://www.openbible.info/labs/cross-references/' },
  { what: 'Kingdoms overlay', detail: 'Approximate empire extents for the map time slider', license: 'CC0 — this project', url: 'https://www.naturalearthdata.com' }
]

const LEARN: Source[] = [
  { what: 'Greek grammar course', detail: 'Original "read real Greek early" lessons; readings rendered from the tagged Greek NT', license: 'Lessons: this project · Greek text: Nestle 1904 (PD) / STEPBible (CC BY)', url: 'https://github.com/STEPBible/STEPBible-Data' },
  { what: 'Vocabulary & drills', detail: 'Frequency-ranked from the tagged Greek NT & Hebrew OT', license: 'CC BY — STEPBible / Tyndale House', url: 'https://github.com/STEPBible/STEPBible-Data' }
]

const AI: Source[] = [
  { what: 'Llama 3.2 (1B / 3B) Instruct', detail: 'Assistant — downloaded on demand', license: 'Llama 3.2 Community License — Meta', url: 'https://huggingface.co/meta-llama' },
  { what: 'Qwen2.5 7B Instruct', detail: 'Assistant (Quality tier)', license: 'Apache 2.0 — Alibaba', url: 'https://huggingface.co/Qwen' },
  { what: 'Nomic Embed Text v1.5', detail: 'Embeddings for semantic search', license: 'Apache 2.0 — Nomic AI', url: 'https://huggingface.co/nomic-ai' }
]

export default function AboutModal(): JSX.Element | null {
  const open = useAppStore((s) => s.aboutOpen)
  const setOpen = useAppStore((s) => s.setAboutOpen)
  const translations = useAppStore((s) => s.translations)
  const setTranslations = useAppStore((s) => s.setTranslations)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.api
      ?.version()
      .then(setVersion)
      .catch(() => undefined)
  }, [])

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

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-panel border-b border-line px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-accent">
            <BookIcon className="w-5 h-5" />
            <span className="font-semibold text-ink">Open Bible Study</span>
            {version && <span className="text-xs text-faint tabular-nums">v{version}</span>}
          </div>
          <button
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

          <UpdateSetting />

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
            {status && <div className="mt-2 text-xs text-muted">{status}</div>}
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
      </div>
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

/**
 * The update check is the only thing this app ever sends over the network, so it gets an explicit,
 * visible switch — and says plainly what it does and doesn't do.
 */
function UpdateSetting(): JSX.Element {
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
      const info = await window.updates?.check(true)
      setResult(info ? `Version ${info.latest} is available.` : 'You’re on the latest version.')
    } catch {
      setResult('Couldn’t reach GitHub — you may be offline.')
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
            Asks GitHub once a day whether a newer release exists. Nothing about you is sent, and
            everything else in this app stays fully offline. Turn it off and no request is made.
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
      {result && <div className="mt-2 text-xs text-accent">{result}</div>}
    </div>
  )
}
