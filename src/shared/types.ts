// Shared domain + IPC contract types, used by main, preload, and renderer.

export type TextDirection = 'ltr' | 'rtl'

export interface Translation {
  id: string
  abbrev: string
  name: string
  language: string // ISO code: 'eng', 'hbo', 'grc', ...
  direction: TextDirection
  isOriginal: boolean
  hasStrongs: boolean
  license: string
  attribution: string
}

/** One word within a verse, for Strong's overlay + interlinear. */
export interface VerseToken {
  position: number
  surface: string // the word as printed
  trailer: string // punctuation/whitespace that follows (for faithful re-rendering)
  strongs: string | null // e.g. "G26" / "H430"
  lemma: string | null
  translit: string | null
  morph: string | null
  gloss: string | null
  aligned?: Record<string, string> // interlinear: stacked translation id → aligned word(s)
  parses?: WordParse[] // interlinear "all parses": Scripture-attested analyses of this form
}

/** One Scripture-attested analysis of an original-language form (from the scholar-tagged text). */
export interface WordParse {
  strongs: string | null
  morph: string | null
  gloss: string | null
  count: number // how often the form is tagged this way across the corpus
}

export interface Verse {
  verse: number
  text: string
  tokens: VerseToken[] | null // null when the translation has no word-level data
}

export interface ChapterRef {
  translation: string
  book: string
  chapter: number
}

export interface ChapterContent extends ChapterRef {
  bookName: string
  direction: TextDirection
  verses: Verse[]
}

export interface StrongsEntry {
  id: string // "G26"
  language: 'greek' | 'hebrew'
  lemma: string
  translit: string
  pronunciation: string | null
  definition: string
  kjvDef: string | null
  occurrences: number
}

/** One sub-entry from a scholarly lexicon (BDB / Abbott-Smith / LSJ), keyed to a Strong's number. */
export interface LexiconEntry {
  extKey: string | null // extended Strong's, e.g. 'G0001G'
  headword: string | null
  translit: string | null
  gloss: string | null
  body: string // sanitised: only <b>/<i> tags + newlines
}
export interface LexiconGroup {
  lexicon: string // 'TBESG' | 'TBESH' | 'TFLSJ'
  name: string // short display name, e.g. 'Abbott-Smith'
  basedOn: string // fuller attribution, e.g. 'Abbott-Smith (Greek NT)'
  entries: LexiconEntry[]
}

export interface SearchQuery {
  text: string
  translation: string
  testament?: 'OT' | 'NT' | 'all'
  book?: string | null
  limit?: number
  offset?: number
}

export interface SearchHit {
  book: string
  bookName: string
  chapter: number
  verse: number
  snippet: string // FTS-highlighted excerpt
}

export interface SearchResponse {
  total: number
  hits: SearchHit[]
}

/** A verse where a given Strong's number occurs (word-study concordance). */
export interface ConcordanceHit {
  book: string
  bookName: string
  chapter: number
  verse: number
  surface: string // the English word(s) that carry this Strong's here
  snippet: string // full verse text with the matched word(s) marked {{…}}
}

export interface ConcordanceResponse {
  total: number
  hits: ConcordanceHit[]
}

export interface ConcordanceOptions {
  translation?: string
  limit?: number
  offset?: number
}

/** A selectable original-language edition for the interlinear. */
export interface Edition {
  id: string
  name: string
  language: string // 'hbo' | 'grc'
  testament: 'OT' | 'NT'
}

export interface InterlinearContent {
  book: string
  chapter: number
  edition: string
  direction: TextDirection
  verses: {
    verse: number
    tokens: VerseToken[]
    lines?: { id: string; text: string }[] // untagged stacked translations, shown as a verse line
  }[]
}

export interface ImportedTranslation {
  id: string
  abbrev: string
  name: string
  direction: TextDirection
  verseCount: number
}

/** One word in a TR-vs-Critical comparison: present in both, or only one edition. */
export interface VariantItem {
  surface: string
  strongs: string | null
  translit: string | null
  gloss: string | null
  // NT (Greek): 'both' = shared, 'critical' = NA-only, 'tr' = TR-only.
  // OT (Hebrew): 'qere' = the read/main form, 'ketiv' = the written variant.
  side: 'both' | 'critical' | 'tr' | 'qere' | 'ketiv'
}
export interface VerseVariant {
  verse: number
  items: VariantItem[]
}

// ---- Local AI assistant + RAG ----

export type ChatTier = 'fast' | 'balanced' | 'quality'
export interface AiConfig {
  baseUrl: string
  chatModel: string
  embedModel: string
  provider: 'auto' | 'bundled' | 'ollama'
  chatTier: 'auto' | ChatTier
}
export interface AiStatus {
  available: boolean
  activeProvider: 'bundled' | 'ollama' | 'none'
  needsSetup: boolean
  hasGpu: boolean
  models: string[]
  config: AiConfig
  chatModelLabel: string // active bundled model's display name (empty if none)
  installedTiers: ChatTier[] // which bundled chat tiers are downloaded
}
export interface AiSetupProgress {
  role: 'chat' | 'embed'
  label: string
  received: number
  total: number
  done: boolean
  error?: string
}
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
export interface ChatCitation {
  book: string
  bookName: string
  chapter: number
  verse: number
  text: string
  source?: string // document name when the citation is from a user doc
}
export interface ChatResult {
  text: string
  citations: ChatCitation[]
}
export interface AiTokenEvent {
  token?: string
  done?: boolean
  error?: string
  citations?: ChatCitation[]
}
export interface AiDoc {
  id: string
  name: string
  chunks: number
  active: boolean
  addedAt: number
}
export interface AiIndexStatus {
  bibleIndexed: number
  bibleTotal: number
  building: boolean
  stale?: boolean // indexed by a different embedding model → needs a rebuild
}

export interface AiApi {
  status(): Promise<AiStatus>
  setConfig(patch: Partial<AiConfig>): Promise<AiConfig>
  chat(
    conversationId: string,
    messages: ChatMessage[],
    grounding: { translation: string } | null,
    extraContext?: ChatCitation[]
  ): Promise<ChatResult>
  stop(conversationId: string): Promise<void>
  onToken(cb: (e: AiTokenEvent) => void): () => void

  listDocuments(): Promise<AiDoc[]>
  importDocument(): Promise<AiDoc | null>
  setDocumentActive(id: string, active: boolean): Promise<void>
  deleteDocument(id: string): Promise<void>

  indexStatus(translation: string): Promise<AiIndexStatus>
  buildBibleIndex(translation: string): Promise<void>
  onIndexProgress(cb: (s: AiIndexStatus) => void): () => void

  setupBundled(): Promise<void>
  onSetupProgress(cb: (p: AiSetupProgress) => void): () => void
}

// ---- User data (notes + highlighting), stored in a separate user.sqlite ----

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange'

export interface Highlight {
  id: number
  translation: string
  book: string
  chapter: number
  verse: number
  startToken: number | null // null = whole verse
  endToken: number | null
  color: HighlightColor
  createdAt: number
}
export type HighlightInput = Omit<Highlight, 'id' | 'createdAt'>

export interface Note {
  id: number
  book: string
  chapter: number
  verse: number
  body: string
  createdAt: number
  updatedAt: number
}
export type NoteInput = { id?: number; book: string; chapter: number; verse: number; body: string }

export interface LexBrowseOptions {
  language?: 'greek' | 'hebrew'
  query?: string
  limit?: number
  offset?: number
}
export interface LexBrowseEntry {
  id: string
  language: string
  lemma: string
  translit: string
  gloss: string
}
export interface LexBrowseResult {
  total: number
  entries: LexBrowseEntry[]
}

// ---- Genealogies / Maps / Timelines (Theographic) ----
export interface PersonRef {
  id: number
  name: string
}
export interface PersonListItem {
  id: number
  name: string
  gender: string | null
  birthYear: number | null
  deathYear: number | null
  verseCount: number
}
export interface PersonDetail extends PersonListItem {
  summary: string | null
  father: PersonRef | null
  mother: PersonRef | null
  spouses: PersonRef[]
  children: PersonRef[]
  verses: string[] // "Book.ch.v"
}
export interface PlaceItem {
  id: number
  name: string
  lat: number
  lon: number
  featureType: string | null
  verseCount: number
}
export interface EventItem {
  id: number
  title: string
  startYear: number | null
  participants: PersonRef[]
  places: PersonRef[]
  verses: string[]
}

/** The full API surface exposed on `window.api` via contextBridge. */
export interface BibleApi {
  version(): Promise<string>
  listTranslations(): Promise<Translation[]>
  getChapter(ref: ChapterRef): Promise<ChapterContent>
  getStrongs(id: string): Promise<StrongsEntry | null>
  browseLexicon(opts: LexBrowseOptions): Promise<LexBrowseResult>
  getPeople(query?: string, limit?: number): Promise<PersonListItem[]>
  getPerson(id: number): Promise<PersonDetail | null>
  getPlaces(): Promise<PlaceItem[]>
  getPlaceVerses(id: number): Promise<string[]>
  getEvents(): Promise<EventItem[]>
  getMapLand(): Promise<string>
  getLexiconEntries(strongs: string): Promise<LexiconGroup[]>
  getLexiconByWord(word: string): Promise<string | null>
  getConcordance(strongs: string, opts?: ConcordanceOptions): Promise<ConcordanceResponse>
  listEditions(): Promise<Edition[]>
  getInterlinear(
    book: string,
    chapter: number,
    edition: string,
    translations?: string[],
    includeParses?: boolean
  ): Promise<InterlinearContent>
  getChapterApparatus(book: string, chapter: number): Promise<VerseVariant[]>
  search(query: SearchQuery): Promise<SearchResponse>

  listHighlights(ref: ChapterRef): Promise<Highlight[]>
  saveHighlight(input: HighlightInput): Promise<Highlight>
  deleteHighlight(id: number): Promise<void>

  listNotes(ref: { book: string; chapter: number }): Promise<Note[]>
  saveNote(input: NoteInput): Promise<Note>
  deleteNote(id: number): Promise<void>

  importTranslation(): Promise<ImportedTranslation | null>
  deleteImportedTranslation(id: string): Promise<void>
}
