import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from 'react'
import { BOOK_BY_ID, BOOKS, BOOKS_CHRONO } from '@shared/books'
import { openPassage, readerPassage } from '@/lib/openPassage'
import { chooseColumn, readingFeatures, type ReadingFeature } from '@shared/readingDisplay'
import { mapPassage } from '@shared/passageMapping'
import { studyDataCredits } from '@shared/dataCredits'
import { readingEdition, useAppStore } from '@/store/useAppStore'
import { useStudyQuery } from '@/hooks/useStudyQuery'
import { readerChapter } from '@/lib/passage'
import { studyStorageKey } from '@/lib/studyPreferences'
import { HIGHLIGHT_COLORS, highlightVar } from '@/lib/highlights'
import type { ReaderVerseAction } from '@/components/ReaderActions'
import type { Bookmark, HistoryEntry, Note } from '@shared/types'
import { phoneTextSizes, verseDraftKey } from './phonePreferences'
import { hasRecoveryBackup, exportRecoveryBackup } from './personalApi'
import { Study } from './study'
import { ChevronRight } from '@/components/icons'
import DeleteVerseNote from '@/components/DeleteVerseNote'
import NoteDraftReview from '@/components/NoteDraftReview'
import { draftNeedsReview, readNoteDraft, type NoteDraft } from '@/lib/noteDraft'

export type Icon = ComponentType<SVGProps<SVGSVGElement>>
export const bookName = (book: string) => BOOK_BY_ID[book]?.name ?? book
export function Tool({
  label,
  detail,
  icon: Icon,
  onClick
}: {
  label: string
  detail?: string
  icon: Icon
  onClick: () => void
}) {
  return (
    <button className="tool-row" onClick={onClick}>
      <span className="tool-mark">
        <Icon aria-hidden="true" />
      </span>
      <span className="tool-text">
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <ChevronRight className="end-chevron" aria-hidden="true" />
    </button>
  )
}
export function PhoneSheet({
  title,
  close,
  back,
  children,
  header = true,
  roomy = false
}: {
  title: string
  close: () => void
  back?: () => void
  children: ReactNode
  header?: boolean
  roomy?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current!
    node.showModal()
    return () => node.close()
  }, [])
  return (
    <dialog
      className={'phone-sheet' + (roomy ? ' roomy' : '')}
      ref={dialog}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        if (back) back()
        else close()
      }}
      onClick={(e) => {
        if (e.target !== dialog.current) return
        const rect = dialog.current.getBoundingClientRect()
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) close()
      }}
    >
      {header && <div className="sheet-bar">
        {back && <button className="phone-icon" aria-label="Back" onClick={back}><ChevronRight className="rotate-180" /></button>}
        <h2>{title}</h2>
        <button className="phone-icon" aria-label="Close" onClick={close}>
          ×
        </button>
      </div>}
      <div className="sheet-content">{children}</div>
    </dialog>
  )
}
export function PassagePicker({ close }: { close: () => void }) {
  const s = useAppStore.getState()
  const current = readerChapter(s.book, s.chapter, s.activeVerse, s.referenceEdition || s.primary, readingEdition(s))
  const [book, setBook] = useState(current?.book ?? s.book)
  const [chapter, setChapter] = useState(current?.chapter ?? s.chapter)
  const [verse, setVerse] = useState('')
  const [search, setSearch] = useState('')
  const [issue, setIssue] = useState('')
  const [busy, setBusy] = useState(false)
  const chrono = useAppStore((st) => st.chronological)
  const ref = readerPassage(search)
  const edition = ref?.edition ?? readingEdition(s, book)
  const chapterCount = book === 'Ps' && edition === 'LXX' ? 151 : BOOK_BY_ID[book].chapters
  const open = async () => {
    const b = ref?.book ?? book,
      c = ref?.chapter ?? chapter
    const requested = ref ? ref.firstVerse : verse ? Number(verse) : undefined
    setBusy(true)
    setIssue('')
    try {
      if (search.trim() && !ref) { setIssue('Enter a reference such as John 3:16.'); return }
      await openPassage({ book: b, chapter: c, firstVerse: requested ?? undefined }, edition)
      close()
    } catch (e) {
      setIssue(e instanceof Error ? e.message : 'Could not open this passage.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="phone-form"
      onSubmit={(e) => {
        e.preventDefault()
        void open()
      }}
    >
      <label>
        Go to a reference
        <input placeholder="e.g. John 3:16" value={search} onChange={(e) => { setSearch(e.target.value); setIssue('') }} />
      </label>
      <div className="phone-pair">
        <label>
          Book
          <select
            value={book}
            onChange={(e) => {
              setBook(e.target.value)
              setChapter(1)
              setVerse('')
              setSearch('')
            }}
          >
            {(chrono ? BOOKS_CHRONO : BOOKS).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Chapter
          <select
            value={chapter}
            onChange={(e) => {
              setChapter(Number(e.target.value))
              setVerse('')
              setSearch('')
            }}
          >
            {Array.from({ length: chapterCount }, (_, i) => (
              <option key={i + 1}>{i + 1}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Verse
        <input
          type="number"
          min="1"
          inputMode="numeric"
          placeholder="Beginning of chapter"
          value={verse}
          onChange={(e) => {
            setVerse(e.target.value)
            setSearch('')
          }}
        />
      </label>
      <label className="setting-row">
        <span>Chronological book order</span>
        <input type="checkbox" checked={chrono} onChange={s.toggleChronological} />
      </label>
      {search.trim() && !ref && <p role="status">Enter a valid reference for {edition}, such as John 3:16.</p>}
      {issue && (
        <p className="status" role="alert">
          {issue}
        </p>
      )}
      <button className="phone-button primary" disabled={busy || (!!search && !ref)}>
        Open passage
      </button>
    </form>
  )
}
export function EditionPicker() {
  const editions = useAppStore((s) => s.translations),
    columns = useAppStore((s) => s.parallels)
  const set = (ids: string[]) => {
    const s = useAppStore.getState()
    s.setParallels(ids)
    if (s.interlinear) s.toggleInterlinear()
  }
  const [feedback, setFeedback] = useState(''),
    [busy, setBusy] = useState(false)
  const add = editions.find((t) => !columns.includes(t.id))
  async function manage(remove?: string) {
    setBusy(true)
    setFeedback('')
    try {
      if (remove) await window.api.deleteImportedTranslation(remove)
      else {
        const result = await window.api.importTranslation()
        if (!result) return
        setFeedback(result.name + ' imported.')
      }
      useAppStore.getState().setTranslations(await window.api.listTranslations())
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'Could not update translations.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="phone-form">
      {columns.map((id, i) => (
        <div className="edition-row" key={i}>
          <label>
            {i === 0 ? 'Reading translation' : 'Parallel ' + i}
            <select
              aria-label={i === 0 ? 'Translation' : 'Parallel translation ' + i}
              value={id}
              onChange={(e) => set(chooseColumn(columns, i, e.target.value))}
            >
              {editions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.abbrev})
                </option>
              ))}
            </select>
          </label>
          {columns.length > 1 && (
            <button
              className="phone-icon remove"
              aria-label={'Remove ' + id}
              onClick={() => set(columns.filter((_, j) => j !== i))}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {columns.length < 4 && add && (
        <button className="phone-button" onClick={() => set([...columns, add.id])}>
          Add parallel translation
        </button>
      )}
      <details className="phone-details">
        <summary>Manage imported translations</summary>
        <button className="phone-button" disabled={busy} onClick={() => void manage()}>
          Import a Bible module…
        </button>
        {editions
          .filter((t) => t.language === 'imported')
          .map((t) => (
            <div key={t.id} className="setting-row">
              {t.name}
              <button
                onClick={() => {
                  if (window.confirm('Remove ' + t.name + ' from this device?')) void manage(t.id)
                }}
                disabled={busy}
              >
                Remove
              </button>
            </div>
          ))}
        {feedback && <p role="status">{feedback}</p>}
      </details>
    </div>
  )
}
export function DisplaySettings({
  size,
  changeSize,
  chooseTerms,
  preferred
}: {
  size: number
  changeSize: (n: number) => void
  chooseTerms: () => void
  preferred: () => void
}) {
  const state = useAppStore(),
    [which, setWhich] = useState('')
  return (
    <div className="phone-form">
      <label className="setting-row">
        <span>Scripture text size</span>
        <select value={size} onChange={(e) => changeSize(+e.target.value)}>
          {phoneTextSizes.map((n) => (
            <option key={n} value={n}>
              {n} px
            </option>
          ))}
        </select>
      </label>
      <label className="setting-row">
        <span>Dark theme</span>
        <input type="checkbox" checked={state.theme === 'dark'} onChange={state.toggleTheme} />
      </label>
      <label className="setting-row">
        <span>Show Strong’s numbers</span>
        <input type="checkbox" checked={state.strongsVisible} onChange={state.toggleStrongs} />
      </label>
      <label className="setting-row">
        <span>Restore verified words</span>
        <input type="checkbox" checked={state.restoreSourceWords} onChange={state.toggleSourceWords} />
      </label>
      <button className="link-row" onClick={chooseTerms}>
        Choose words to restore <ChevronRight />
      </button>
      <button className="link-row" onClick={preferred}>
        Preferred text order <ChevronRight />
      </button>
      <h3 className="section-label">Passage display</h3>
      <label className="setting-row">
        Apply to
        <select value={which} onChange={(e) => setWhich(e.target.value)}>
          <option value="">All translations</option>
          {state.translations.map((t) => (
            <option key={t.id} value={t.id}>
              {t.abbrev}
            </option>
          ))}
        </select>
      </label>
      {(Object.keys(readingFeatures) as ReadingFeature[]).map((f) => (
        <label key={f} className="setting-row">
          <span>{readingFeatures[f]}</span>
          {which ? (
            <select
              value={
                state.displayOverrides[which]?.[f] == null
                  ? 'inherit'
                  : String(state.displayOverrides[which][f])
              }
              onChange={(e) =>
                state.setDisplayOverride(
                  which,
                  f,
                  e.target.value === 'inherit' ? null : e.target.value === 'true'
                )
              }
            >
              <option value="inherit">Default ({state.displayDefaults[f] ? 'on' : 'off'})</option>
              <option value="true">On</option>
              <option value="false">Off</option>
            </select>
          ) : (
            <input
              type="checkbox"
              checked={state.displayDefaults[f]}
              onChange={(e) => state.setDisplayDefault(f, e.target.checked)}
            />
          )}
        </label>
      ))}
    </div>
  )
}
export function SavedPlaces({ close }: { close: () => void }) {
  const s = useAppStore.getState()
  const edition = s.referenceEdition || s.primary
  const ref =
    edition.startsWith('imp_') || readingEdition(s).startsWith('imp_')
      ? null
      : mapPassage({ book: s.book, chapter: s.chapter, verse: s.activeVerse ?? 1 }, edition, 'KJV')
  const [marks, setMarks] = useState<Bookmark[]>([]),
    [history, setHistory] = useState<HistoryEntry[]>([])
  const [name, setName] = useState(
    bookName(s.book) + ' ' + s.chapter + (s.activeVerse ? ':' + s.activeVerse : '')
  )
  const [message, setMessage] = useState('')
  const refresh = () =>
    Promise.all([window.api.listBookmarks(), window.api.listHistory(60)])
      .then(([m, h]) => {
        setMarks(m)
        setHistory(h)
      })
      .catch((e) => setMessage(String(e)))
  useEffect(() => {
    void refresh()
  }, [])
  const open = (b: string, c: number, v: number | null) => {
    s.goToVerse(b, c, v ?? 1, 'KJV')
    close()
  }
  return (
    <div className="phone-form">
      <label>
        Bookmark this passage
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button
        className="phone-button"
        disabled={!ref || !name.trim()}
        onClick={async () => {
          try {
            await window.api.addBookmark({ ...ref!, name: name.trim() })
            await refresh()
          } catch (e) {
            setMessage(String(e))
          }
        }}
      >
        Add bookmark
      </button>
      {!ref && <p className="status">Bookmarking requires a verified location in the reference edition.</p>}
      {message && <p role="alert">{message}</p>}
      <h3 className="section-label">Bookmarks</h3>
      {marks.length ? (
        marks.map((m) => (
          <div key={m.id} className="saved-row">
            <button onClick={() => open(m.book, m.chapter, m.verse)}>
              {m.name}
              <small>
                {bookName(m.book)} {m.chapter}:{m.verse}
              </small>
            </button>
            <button
              aria-label={'Remove ' + m.name}
              onClick={() =>
                window.api
                  .deleteBookmark(m.id)
                  .then(refresh)
                  .catch((e) => setMessage(String(e)))
              }
            >
              ×
            </button>
          </div>
        ))
      ) : (
        <p className="status">Your bookmarks will appear here.</p>
      )}
      <h3 className="section-label">Recent passages</h3>
      {history.map((h) => (
        <button className="link-row" key={h.id} onClick={() => open(h.book, h.chapter, h.verse)}>
          {bookName(h.book)} {h.chapter}
          <ChevronRight />
        </button>
      ))}
    </div>
  )
}
export function BackupTools() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  const [recovery, setRecovery] = useState(false)
  useEffect(() => {
    let live = true
    void hasRecoveryBackup()
      .then((value) => {
        if (live) setRecovery(value)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  async function run(mode: 'save' | 'restore' | 'markdown' | 'recovery') {
    setBusy(true)
    setMessage('')
    try {
      const state = localStorage.getItem(studyStorageKey())
      const result =
        mode === 'recovery'
          ? await exportRecoveryBackup()
          : mode === 'save'
            ? await window.api.createStudyBackup(state)
            : mode === 'restore'
              ? await window.api.restoreStudyBackup(state)
              : await window.api.exportMarkdown()
      if (result) setMessage(typeof result === 'string' ? 'Saved to ' + result : 'Study backup restored.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not complete this action.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="phone-form">
      <h3 className="section-label">Study files</h3>
      <p className="status">
        Save your notes, highlights, bookmarks, learning progress, translations, notebook, and reader
        settings together.
      </p>
      <button disabled={busy} className="phone-button" onClick={() => void run('save')}>
        Save study backup…
      </button>
      <button disabled={busy} className="phone-button" onClick={() => void run('restore')}>
        Restore study backup…
      </button>
      {recovery && (
        <button disabled={busy} className="phone-button" onClick={() => void run('recovery')}>
          Save pre-restore backup…
        </button>
      )}
      <button disabled={busy} className="phone-button" onClick={() => void run('markdown')}>
        Export notes as Markdown…
      </button>
      {message && <p role="status">{message}</p>}
      <details className="phone-details">
        <summary>Sources and licenses</summary>
        {studyDataCredits.map((c) => (
          <div className="credit" key={c.what}>
            <strong>{c.what}</strong>
            <p>{c.detail}</p>
            <small>{c.license}</small>
            <a href={c.url} rel="noreferrer" target="_blank">
              Source
            </a>
          </div>
        ))}
      </details>
    </div>
  )
}
export function VersePicker({ columns, onOpen }: {
  columns: { translation: string; book: string; chapter: number; verse?: number }[]
  onOpen: (item: ReaderVerseAction) => void
}) {
  const [choice, setChoice] = useState(0)
  const [picked, setPicked] = useState<number>()
  const ref = columns[choice]
  const { data, error, loading, retry } = useStudyQuery(useCallback(() =>
    window.api.getChapter({ translation: ref.translation, book: ref.book, chapter: ref.chapter }),
    [ref?.translation, ref?.book, ref?.chapter]), !!ref)
  const rows = data?.verses ?? []
  const row = rows.find(v => v.verse === (picked ?? ref?.verse)) ?? rows[0]
  return <div className="phone-form">
    {columns.length > 1 && <label>Translation<select value={choice} onChange={e => { setChoice(Number(e.target.value)); setPicked(undefined) }}>
      {columns.map((column, i) => <option key={column.translation} value={i}>{column.translation}</option>)}
    </select></label>}
    {ref && <label>{bookName(ref.book)} {ref.chapter} · {ref.translation}
      <select aria-label="Choose verse" disabled={!rows.length} value={row?.verse ?? ''} onChange={e => setPicked(Number(e.target.value))}>
        {rows.map(v => <option key={v.verse} value={v.verse}>Verse {v.verse}</option>)}
      </select></label>}
    {row && <p data-study-scripture="" dir={data?.direction} className="text-sm">{row.text}</p>}
    {error ? <p role="alert">{error} <button onClick={retry}>Retry</button></p> :
      loading ? <p role="status">Loading verses…</p> : !row && <p>No corresponding verse text is available in the selected translation.</p>}
    <button className="phone-button primary" disabled={!row} onClick={() =>
      row && onOpen({ ...ref, verse: row.verse, text: row.text, notes: [] })}>Open verse actions</button>
  </div>
}

export function VerseActions({
  item,
  context,
  showOriginals,
  showRefs
}: {
  item: ReaderVerseAction
  context: () => void
  showOriginals: () => void
  showRefs: () => void
}) {
  const { book, chapter, verse, translation, text } = item,
    canonical = translation.startsWith('imp_')
      ? null
      : mapPassage({ book, chapter, verse }, translation, 'KJV')
  const key = verseDraftKey({ translation, book, chapter, verse })
  const [notes, setNotes] = useState<Note[]>(item.notes),
    [draft, setDraft] = useState(() => readNoteDraft(localStorage, key, 'json'))
  const savedBody = notes[0]?.body ?? null
  const noteText = draft?.text ?? savedBody ?? ''
  const review = !!draft && draftNeedsReview(draft, savedBody)
  function edit(text: string, base: NoteDraft['base']) {
    const next = { text, base }
    setDraft(next)
    localStorage.setItem(key, JSON.stringify(next))
    setMessage('')
  }
  const [highlight, setHighlight] = useState(item.highlight),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [loaded, setLoaded] = useState(false)
  const ref = { translation, book, chapter, verse }
  useEffect(() => {
    let active = true
    Promise.all([
      canonical
        ? window.api.listNotes({ book: canonical.book, chapter: canonical.chapter })
        : Promise.resolve([]),
      window.api.listHighlights(ref)
    ])
      .then(([rows, h]) => {
        if (!active) return
        const matching = rows.filter((n) => n.verse === canonical?.verse)
        setNotes(matching)
        setDraft(readNoteDraft(localStorage, key, 'json'))
        setHighlight(h.find((v) => v.verse === verse && v.startToken == null))
        setLoaded(true)
      })
      .catch((e) => {
        if (active) setMessage(String(e))
      })
    return () => {
      active = false
    }
  }, [translation, book, chapter, verse])
  async function run(fn: () => Promise<void>, success: string) {
    setBusy(true)
    setMessage('')
    try {
      await fn()
      useAppStore.getState().bumpUserData()
      setMessage(success)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }
  const quote = bookName(book) + ' ' + chapter + ':' + verse + ' (' + translation + ')\n' + text
  return (
    <div className="phone-form">
      <blockquote data-study-scripture="" dir="auto">
        {text}
        <cite>{translation}</cite>
      </blockquote>
      <div className="action-pair">
        <button
          className="phone-button"
          onClick={() =>
            Study.copyText({ text: quote })
              .then(() => setMessage('Published wording copied.'))
              .catch((e) => setMessage(String(e)))
          }
        >
          Copy verse
        </button>
        <button
          className="phone-button"
          onClick={() => Study.shareText({ text: quote }).catch((e) => setMessage(String(e)))}
        >
          Share verse
        </button>
      </div>
      <h3 className="section-label">Highlight</h3>
      <div className="swatches">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            title={c + ' highlight'}
            aria-label={c + ' highlight'}
            aria-pressed={highlight?.color === c}
            disabled={busy || !loaded}
            onClick={() =>
              void run(async () => {
                await window.api.saveHighlight({ ...ref, startToken: null, endToken: null, color: c })
                setHighlight(
                  (await window.api.listHighlights(ref)).find(
                    (h) => h.verse === verse && h.startToken == null
                  )
                )
              }, 'Highlight saved.')
            }
          >
            <span style={{ background: highlightVar(c) }}>{highlight?.color === c ? '✓' : ''}</span>
          </button>
        ))}
        {highlight && (
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await window.api.deleteHighlight(highlight.id)
                setHighlight(undefined)
              }, 'Highlight cleared.')
            }
          >
            Clear
          </button>
        )}
      </div>
      {!canonical && (
        <p className="status">
          This verse has no verified match in the reference edition for a shared note.
        </p>
      )}
      {canonical && (
        <>
          <label>
            Verse note
            <textarea
              value={noteText}
              rows={3}
              disabled={!loaded || busy}
              onChange={e => edit(e.target.value, draft ? draft.base : savedBody)}
            />
          </label>
          {loaded && review && savedBody !== null && <NoteDraftReview saved={savedBody} review={() => edit(noteText, savedBody)} />}
          <button
            className="phone-button primary"
            disabled={!loaded || busy || review || !noteText.trim() || noteText === savedBody}
            onClick={() =>
              void run(async () => {
                const saved = await window.api.saveNote({ ...canonical, id: notes[0]?.id, body: noteText.trim() })
                setNotes([saved, ...notes.slice(1)])
                setDraft(null)
                localStorage.removeItem(key)
              }, 'Note saved.')
            }
          >
            Save note
          </button>
          {draft && <button className="phone-button" disabled={busy} onClick={() => {
            localStorage.removeItem(key); setDraft(null); setMessage('')
          }}>Discard draft</button>}
          {notes[0] && <DeleteVerseNote key={notes[0].id} disabled={!loaded || busy}
            onDelete={() => run(async () => {
              await window.api.deleteNote(notes[0].id)
              setNotes(notes.slice(1))
              setDraft(null)
              localStorage.removeItem(key)
            }, 'Note deleted.')} />}
        </>
      )}
      {message && (
        <p role="status" className="status">
          {message}
        </p>
      )}
      <button className="link-row" onClick={context}>
        Passage context
        <ChevronRight />
      </button>
      <button className="link-row" onClick={showRefs}>
        Cross-references
        <ChevronRight />
      </button>
      <button className="link-row" onClick={showOriginals}>
        Compare source texts
        <ChevronRight />
      </button>
    </div>
  )
}
