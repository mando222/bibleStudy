import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type SVGProps } from 'react'
import { BOOK_BY_ID } from '@shared/books'
import type { ReaderVerseAction } from '@/components/ReaderActions'
import { useStudyQuery } from '@/hooks/useStudyQuery'
import { useAppStore } from '@/store/useAppStore'
import {
  BookIcon, ChevronRight, ColumnsIcon, CompareIcon, FileIcon, InterlinearIcon,
  LinkIcon, MapPinIcon, NotebookIcon, PenIcon, SendIcon, SettingsIcon
} from '@/components/icons'
import { Study } from './study'

export type PassageToolColumn = { translation: string; book: string; chapter: number; verse?: number }
export type PassageToolAction = 'notes' | 'context' | 'refs' | 'originals' | 'variants' | 'chapterNotes'
type Props = {
  columns: PassageToolColumn[]
  interlinear: boolean
  onStudy: (action: PassageToolAction, item: ReaderVerseAction) => void
  onParallels: () => void
  onInterlinear: () => void
  onDisplay: () => void
}
type Icon = ComponentType<SVGProps<SVGSVGElement>>

function PassageTool({ label, detail, icon: Icon, disabled, onClick }: {
  label: string; detail: string; icon: Icon; disabled?: boolean; onClick: () => void
}) {
  return <button type="button" className="passage-tool-row" disabled={disabled} onClick={onClick}>
    <span className="passage-tool-mark"><Icon aria-hidden="true" /></span>
    <span className="passage-tool-text"><strong>{label}</strong><small>{detail}</small></span>
    <ChevronRight aria-hidden="true" />
  </button>
}

export function PassageTools({ columns, interlinear, onStudy, onParallels, onInterlinear, onDisplay }: Props) {
  const editions = useAppStore(state => state.translations)
  const editionName = (id: string) => {
    const edition = editions.find(edition => edition.id === id)
    return edition ? `${edition.abbrev} — ${edition.name}` : id.startsWith('imp_') ? 'Imported translation' : id
  }
  const editionAbbrev = (id: string) => editions.find(edition => edition.id === id)?.abbrev
    ?? (id.startsWith('imp_') ? 'Imported translation' : id)
  const [category, setCategory] = useState<'study' | 'reading'>('study')
  const [translation, setTranslation] = useState(columns[0]?.translation)
  const ref = columns.find(column => column.translation === translation) ?? columns[0]
  const chapterKey = ref ? `${ref.translation}:${ref.book}:${ref.chapter}` : ''
  const [picked, setPicked] = useState<{ chapterKey: string; verse: number }>()
  const targetVerse = picked?.chapterKey === chapterKey ? picked.verse : ref?.verse
  const { data, error, loading, retry } = useStudyQuery(useCallback(() => {
    if (!ref) return Promise.reject(new Error('No reading passage is selected.'))
    return window.api.getChapter({ translation: ref.translation, book: ref.book, chapter: ref.chapter })
  }, [ref?.translation, ref?.book, ref?.chapter]), !!ref)
  const rows = data?.verses ?? []
  const row = targetVerse == null ? rows[0] : rows.find(verse => verse.verse === targetVerse)
  const item: ReaderVerseAction | undefined = ref && row
    ? { translation: ref.translation, book: ref.book, chapter: ref.chapter, verse: row.verse, text: row.text, notes: [] }
    : undefined
  const selectionKey = `${chapterKey}:${row?.verse ?? targetVerse ?? ''}`
  const [expanded, setExpanded] = useState<string>()
  const isExpanded = expanded === selectionKey
  const preview = useRef<HTMLParagraphElement>(null)
  const [clipping, setClipping] = useState<{ key: string; clipped: boolean }>()
  const previewId = useId()
  const bookName = ref && (BOOK_BY_ID[ref.book]?.name ?? ref.book)
  const reference = ref ? `${bookName} ${ref.chapter}${row || targetVerse != null ? `:${row?.verse ?? targetVerse}` : ''}` : ''
  const [feedback, setFeedback] = useState<{ key: string; busy?: 'copy' | 'share'; message?: string; error?: boolean }>()
  const operation = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  // Keep the choice tied to its edition when parallel columns are reordered or removed.
  useEffect(() => {
    if (ref?.translation !== translation) setTranslation(ref?.translation)
  }, [ref?.translation, translation])
  useLayoutEffect(() => {
    const node = preview.current
    if (!node || isExpanded) return
    const measure = () => setClipping({ key: selectionKey, clipped: node.scrollHeight > node.clientHeight + 1 })
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    observer?.observe(node)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [selectionKey, row?.text, category, isExpanded])
  const currentFeedback = feedback?.key === selectionKey ? feedback : undefined
  async function publish(action: 'copy' | 'share') {
    if (!item || currentFeedback?.busy) return
    const key = selectionKey, request = ++operation.current
    const text = `${reference} (${item.translation})\n${item.text}`
    setFeedback({ key, busy: action })
    try {
      await (action === 'copy' ? Study.copyText({ text }) : Study.shareText({ text }))
      if (mounted.current && operation.current === request) {
        setFeedback({ key, message: action === 'copy' ? 'Published wording copied.' : 'Share options opened.' })
      }
    } catch (error) {
      if (mounted.current && operation.current === request) {
        const detail = error instanceof Error ? error.message : 'Please try again.'
        setFeedback({ key, error: true, message: `Could not ${action} this verse. ${detail}` })
      }
    }
  }
  const study = (action: PassageToolAction) => { if (item) onStudy(action, item) }

  return <div className="passage-tools">
    <div className="passage-tools-categories" role="group" aria-label="Passage tool categories">
      <button type="button" aria-pressed={category === 'study'} onClick={() => setCategory('study')}>Study</button>
      <button type="button" aria-pressed={category === 'reading'} onClick={() => setCategory('reading')}>Reading</button>
    </div>
    <div className="passage-tools-selection">
      {ref && <p className="passage-tools-reference">{reference} · {editionAbbrev(ref.translation)}</p>}
      {category === 'study' ? <>
        <div className="passage-tools-choosers">
          {columns.length > 1 && <label>Translation
            <select value={ref?.translation ?? ''} onChange={event => {
              setTranslation(event.target.value)
              setPicked(undefined)
            }}>
              {columns.map(column => <option key={column.translation} value={column.translation}>{editionName(column.translation)}</option>)}
            </select>
          </label>}
          {ref && <label>Verse
            <select aria-label="Choose verse" disabled={!rows.length} value={row?.verse ?? ''}
              onChange={event => setPicked({ chapterKey, verse: Number(event.target.value) })}>
              {!row && <option value="" disabled>{loading ? 'Loading…' : 'Choose a verse'}</option>}
              {rows.map(verse => <option key={verse.verse} value={verse.verse}>Verse {verse.verse}</option>)}
            </select>
          </label>}
        </div>
        {row && <>
          <p ref={preview} id={previewId} data-study-scripture="" dir={data?.direction}
            className={`passage-tools-preview${isExpanded ? ' is-expanded' : ''}`}>{row.text}</p>
          {(isExpanded || clipping?.key === selectionKey && clipping.clipped) && <button type="button"
            className="passage-tools-preview-toggle" aria-controls={previewId}
            aria-expanded={isExpanded} onClick={() => setExpanded(isExpanded ? undefined : selectionKey)}>
            {isExpanded ? 'Show less' : 'Show full verse'}
          </button>}
        </>}
        {error ? <p role="alert" className="passage-tools-empty">Could not load this chapter. {error} <button type="button" onClick={retry}>Retry</button></p>
          : loading ? <p role="status" className="passage-tools-empty">Loading verses…</p>
          : !row && <p className="passage-tools-empty">{ref
            ? 'No corresponding verse text is available in this translation. Choose another recorded verse or translation.'
            : 'No corresponding verse is available for this reading view. Reading tools are still available.'}</p>}
      </> : <button type="button" className="passage-tools-change-verse" onClick={() => setCategory('study')}>Change verse</button>}
    </div>
    {category === 'study' ? <>
      <div className="passage-tools-quick-actions" aria-busy={!!currentFeedback?.busy}>
        <button type="button" disabled={!item} onClick={() => study('notes')}><PenIcon aria-hidden="true" />Note &amp; highlight</button>
        <button type="button" disabled={!item || !!currentFeedback?.busy} onClick={() => void publish('copy')}>
          <FileIcon aria-hidden="true" />{currentFeedback?.busy === 'copy' ? 'Copying…' : 'Copy verse'}
        </button>
        <button type="button" disabled={!item || !!currentFeedback?.busy} onClick={() => void publish('share')}>
          <SendIcon aria-hidden="true" />{currentFeedback?.busy === 'share' ? 'Opening share…' : 'Share verse'}
        </button>
      </div>
      {currentFeedback?.message && <p className="passage-tools-feedback" role={currentFeedback.error ? 'alert' : 'status'}>{currentFeedback.message}</p>}
      <div className="passage-tools-actions">
        <PassageTool label="Passage context" detail="People, places, and events" icon={MapPinIcon} disabled={!item} onClick={() => study('context')} />
        <PassageTool label="Related passages" detail="Cross-references for this verse" icon={LinkIcon} disabled={!item} onClick={() => study('refs')} />
        <PassageTool label="Compare source texts" detail="Recorded Hebrew, Aramaic, and Greek editions" icon={CompareIcon} disabled={!item} onClick={() => study('originals')} />
        <PassageTool label="Textual variants" detail="Recorded differences in source texts" icon={BookIcon} disabled={!item} onClick={() => study('variants')} />
        <PassageTool label="Chapter notes" detail="All notes in the selected chapter" icon={NotebookIcon} disabled={!item} onClick={() => study('chapterNotes')} />
      </div>
    </> : <div className="passage-tools-actions">
      <PassageTool label="Parallel translations" detail="Read editions side by side" icon={ColumnsIcon} onClick={onParallels} />
      <PassageTool label={interlinear ? 'Return to translation' : 'Interlinear'}
        detail={interlinear ? 'Read the selected translation' : 'Read original words with their word information'} icon={InterlinearIcon} onClick={onInterlinear} />
      <PassageTool label="Reading display" detail="Layout, headings, verse numbers, and study guides" icon={SettingsIcon} onClick={onDisplay} />
    </div>}
  </div>
}
