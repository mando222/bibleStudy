import { useAppStore } from '@/store/useAppStore'
import { BOOK_BY_ID } from '@shared/books'
import { BookIcon, SunIcon, MoonIcon, HashIcon, ColumnsIcon } from './icons'

export default function TopBar(): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const strongsVisible = useAppStore((s) => s.strongsVisible)
  const toggleStrongs = useAppStore((s) => s.toggleStrongs)
  const book = useAppStore((s) => s.book)
  const chapter = useAppStore((s) => s.chapter)
  const translations = useAppStore((s) => s.translations)
  const parallels = useAppStore((s) => s.parallels)
  const setParallels = useAppStore((s) => s.setParallels)

  const bookName = BOOK_BY_ID[book]?.name ?? book
  const options = translations.length
    ? translations.map((t) => ({ id: t.id, label: t.abbrev }))
    : parallels.map((id) => ({ id, label: id }))

  const setColumn = (idx: number, id: string): void => {
    const p = [...parallels]
    p[idx] = id
    setParallels(p)
  }
  const addColumn = (): void => {
    const used = new Set(parallels)
    const next = translations.find((t) => !used.has(t.id))?.id
    if (next) setParallels([...parallels, next])
  }
  const removeColumn = (idx: number): void => setParallels(parallels.filter((_, i) => i !== idx))

  const canAdd = translations.length > parallels.length && parallels.length < 4

  return (
    <header className="h-12 shrink-0 border-b border-line bg-panel flex items-center gap-2 px-3">
      <div className="flex items-center gap-2 text-accent">
        <BookIcon className="w-5 h-5" />
        <span className="font-semibold text-sm tracking-tight text-ink whitespace-nowrap">
          Open Bible Study
        </span>
      </div>

      <div className="h-5 w-px bg-line mx-1.5" />

      <div className="font-serif text-[15px] text-ink px-1 whitespace-nowrap">
        {bookName} <span className="text-accent">{chapter}</span>
      </div>

      <div className="flex items-center gap-1.5 ml-1">
        {parallels.map((id, idx) => (
          <div key={idx} className="flex items-center">
            <select
              value={id}
              onChange={(e) => setColumn(idx, e.target.value)}
              className="bg-elevated border border-line rounded-md text-sm px-2 py-1 text-ink outline-none focus:border-accent"
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            {parallels.length > 1 && (
              <button
                onClick={() => removeColumn(idx)}
                className="ml-0.5 w-5 h-5 rounded text-faint hover:text-accent hover:bg-elevated text-xs leading-none"
                title="Remove column"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {canAdd && (
          <button
            onClick={addColumn}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-sm text-muted border border-line hover:bg-elevated"
            title="Add a parallel translation"
          >
            <ColumnsIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1" />

      <button
        onClick={toggleStrongs}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm border transition-colors whitespace-nowrap ${
          strongsVisible
            ? 'bg-accent-soft border-accent text-accent'
            : 'border-line hover:bg-elevated text-muted'
        }`}
        title="Toggle Strong's numbers"
      >
        <HashIcon className="w-4 h-4" />
        Strong&rsquo;s
      </button>

      <button
        onClick={toggleTheme}
        className="p-2 rounded-md hover:bg-elevated text-muted"
        title="Toggle light / dark"
      >
        {theme === 'light' ? <MoonIcon className="w-4 h-4" /> : <SunIcon className="w-4 h-4" />}
      </button>
    </header>
  )
}
