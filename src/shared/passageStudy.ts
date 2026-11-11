import { mapPassage } from './passageMapping'

/** Requested verse(s) in the open edition. Omit both bounds for a chapter. */
export interface StudyRange { edition: string; book: string; chapter: number; firstVerse?: number; lastVerse?: number }
export interface ContextEntity { id: number; name: string; refs: string[] }
export interface ContextPlace extends ContextEntity { role: 'mentioned' | 'setting'; settingRefs: string[] }
export interface ContextEvent extends ContextEntity { startYear: number | null; endYear: number | null }
export interface PassageContext {
  status: 'available' | 'partial' | 'unmapped' | 'unavailable' | 'unverified'
  people: ContextEntity[]
  places: ContextPlace[]
  events: ContextEvent[]
}
export interface PersonMapStop {
  placeId: number
  role: 'birthplace' | 'residence' | 'departure' | 'visit' | 'death'
  label: string
  /** Canonical (KJV-coordinate) supporting verse keys. */
  refs: string[]
  source: string
  journey: string | null
  order: number | null
}
export interface PersonMap { personId: number; name: string; stops: PersonMapStop[] }
export interface ReviewedSpeaker { label: string; detail: string; refs: string[]; disputed: boolean }
export interface StudyStructure {
  title: string
  source: string
  rows: { label: string; firstVerse: number; lastVerse: number }[]
}

const credited = 'Open Bible Study · reviewed passage notes'
const structures: Record<string, StudyStructure> = {
  'Matt.1': {
    title: 'The generations in Matthew’s genealogy', source: credited,
    rows: [
      { label: 'Introduction', firstVerse: 1, lastVerse: 1 },
      { label: 'From Abraham to David', firstVerse: 2, lastVerse: 6 },
      { label: 'From David to the exile', firstVerse: 6, lastVerse: 11 },
      { label: 'From the exile to Jesus', firstVerse: 12, lastVerse: 16 },
      { label: 'Matthew’s summary of the generations', firstVerse: 17, lastVerse: 17 }
    ]
  },
  'Acts.15': {
    title: 'The letter from Jerusalem', source: credited,
    rows: [
      { label: 'Senders, recipients, and greeting', firstVerse: 23, lastVerse: 23 },
      { label: 'Reason for writing', firstVerse: 24, lastVerse: 24 },
      { label: 'The messengers', firstVerse: 25, lastVerse: 27 },
      { label: 'Decision and farewell', firstVerse: 28, lastVerse: 29 }
    ]
  }
}

// Return companion material only for a known edition's corresponding passage. Row links
// use its native numbering. We do not assume an imported module uses our reference system.
export function getStudyStructures(edition: string, book: string, chapter: number): StudyStructure[] {
  if (edition.startsWith('imp_')) return []
  const start = mapPassage({ book, chapter, verse: 1 }, edition, 'KJV')
  if (!start) return []
  const structure = structures[start.book + '.' + start.chapter]
  if (!structure) return []
  const rows = structure.rows.flatMap(row => {
    const first = mapPassage({ ...start, verse: row.firstVerse }, 'KJV', edition)
    const last = mapPassage({ ...start, verse: row.lastVerse }, 'KJV', edition)
    if (!first || !last || first.chapter !== chapter || last.chapter !== chapter) return []
    return [{ label: row.label, firstVerse: first.verse, lastVerse: last.verse }]
  })
  return rows.length ? [{ ...structure, rows }] : []
}

// These marks identify evidence at a verse, not a translation-specific phrase boundary.
const acts15Speakers: Record<number, Omit<ReviewedSpeaker, 'disputed'>> = {
  1: { label: 'Teachers from Judea', detail: 'The verse introduces what the visitors taught.', refs: ['Acts.15.1'] },
  5: { label: 'Some believers from the Pharisees', detail: 'The narrative identifies the group that rose to speak.', refs: ['Acts.15.5'] },
  7: { label: 'Peter', detail: 'Peter rises to speak. His speech continues through verse 11.', refs: ['Acts.15.7', 'Acts.15.11'] },
  13: { label: 'James', detail: 'The narrator names James as the speaker after the assembly hears Barnabas and Paul.', refs: ['Acts.15.12', 'Acts.15.13'] },
  15: { label: 'James introduces a quotation', detail: 'James cites the prophets. Compare the following words with Amos 9:11–12.', refs: ['Acts.15.15', 'Acts.15.16', 'Acts.15.17', 'Amos.9.11', 'Amos.9.12'] },
  19: { label: 'James gives his judgment', detail: 'James gives his conclusion following the quotation.', refs: ['Acts.15.13', 'Acts.15.19'] },
  23: { label: 'Letter from the assembly', detail: 'The narrator introduces the letter. The authors give their greeting here and their farewell in verse 29.', refs: ['Acts.15.22', 'Acts.15.23', 'Acts.15.29'] },
  36: { label: 'Paul', detail: 'The narrator identifies Paul speaking to Barnabas.', refs: ['Acts.15.36'] }
}
export function getReviewedSpeakers(edition: string, book: string, chapter: number, verse: number): ReviewedSpeaker[] {
  if (edition.startsWith('imp_')) return []
  const ref = mapPassage({ book, chapter, verse }, edition, 'KJV')
  if (ref?.book !== 'Acts' || ref.chapter !== 15) return []
  const mark = acts15Speakers[ref.verse]
  return mark ? [{ ...mark, disputed: false }] : []
}
