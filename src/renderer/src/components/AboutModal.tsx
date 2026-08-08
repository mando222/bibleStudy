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
  { what: "Strong's Greek & Hebrew lexicons", detail: 'Strong (1890/1894), JSON', license: 'CC BY-SA — OpenScriptures', url: 'https://github.com/openscriptures/strongs' },
  { what: "KJV Strong's word tagging", detail: 'kaiserlik/kjv', license: 'Open', url: 'https://github.com/kaiserlik/kjv' },
  { what: 'Verse-text distribution', detail: 'helloao Free Use Bible API', license: 'Open', url: 'https://bible.helloao.org' }
]

export default function AboutModal(): JSX.Element | null {
  const open = useAppStore((s) => s.aboutOpen)
  const setOpen = useAppStore((s) => s.setAboutOpen)
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

          <p className="mt-5 text-xs text-faint">
            NKJV and NASB are copyrighted and are not included. Corrections to CC-BY data should go
            upstream to the respective projects.
          </p>
        </div>
      </div>
    </div>
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
