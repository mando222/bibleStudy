import { studyStorageKey } from '../lib/studyPreferences'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { mapPassage } from '@shared/passageMapping'
import { lexiconId } from '@shared/lexiconId'
import type { SourceWordTerms } from '@shared/sourceWords'
import { BOOK_BY_ID } from '@shared/books'
import type { Translation, ChatCitation, SearchHit, SourceWord } from '@shared/types'

export type Theme = 'light' | 'dark'
export type StudyTab = 'lexicon' | 'notes' | 'search' | 'apparatus' | 'crossrefs'
/** Far-right workspace tabs. 'bible' is the reader; the rest are their own full-window views. */
export type Activity = 'bible' | 'genealogies' | 'timelines' | 'maps' | 'words' | 'learn'

/** Which sub-module of the Learn (Greek & Hebrew) activity is showing. */
export type LearnModule = 'alphabet' | 'flashcards' | 'drills' | 'grammar'
export type LearnLanguage = 'greek' | 'hebrew'

/** A named entity the reader is currently looking at, fed to the assistant as live context. */
export interface ActiveRef {
  id: number
  name: string
}

/** One turn in the assistant transcript (persisted so a conversation survives a restart). */
export interface ChatMsg {
  questionContext?: { grounding: { translation: string } | null; selection: ChatCitation[]; active?: string }
  role: 'user' | 'assistant'
  content: string
  citations?: ChatCitation[]
}

/** A passage the user picked (verse menu or text selection) to ask the assistant about. */
export interface PendingContext {
  book: string
  bookName: string
  chapter: number
  verse: number
  translation?: string
  endVerse?: number // for a multi-verse selection
  text: string
}

export interface SelectedOccurrence {
  translation: string
  book: string
  chapter: number
  verse: number
  surface: string
  derived: boolean
  sourceWord?: SourceWord
}

interface AppState {
  theme: Theme
  toggleTheme: () => void

  // Far-right activity rail: which workspace is showing.
  activity: Activity
  setActivity: (a: Activity) => void
  // Cross-view focus: jump to a person in Genealogies / a place in Maps.
  focusPersonId: number | null
  focusPerson: (id: number) => void
  focusPlaceId: number | null
  focusPlace: (id: number) => void
  clearFocus: () => void

  // Library
  translations: Translation[]
  setTranslations: (t: Translation[]) => void

  // About / credits modal
  aboutOpen: boolean
  setAboutOpen: (v: boolean) => void

  // AI assistant drawer
  assistantOpen: boolean
  setAssistantOpen: (v: boolean) => void
  // A passage selected to ask the assistant about (shown as a context pill; transient).
  pendingContext: PendingContext | null
  askAssistantAbout: (ctx: PendingContext) => void
  clearPendingContext: () => void
  // Persisted assistant transcript (restored on relaunch).
  chatMessages: ChatMsg[]
  setChatMessages: (m: ChatMsg[]) => void

  // Active-context slice (transient): what the reader is currently looking at, so the assistant
  // can be aware of the open passage / selected place / person without the user re-typing it.
  activeVerse: number | null
  setActiveVerse: (v: number | null) => void
  activePerson: ActiveRef | null
  setActivePerson: (p: ActiveRef | null) => void
  activePlace: ActiveRef | null
  setActivePlace: (p: ActiveRef | null) => void
  activeEvent: ActiveRef | null
  setActiveEvent: (e: ActiveRef | null) => void

  // Maps: year for the (approximate) kingdoms overlay + the overlay toggle. Cities are never
  // filtered by year — their per-place date coverage is too sparse to be reliable.
  mapYear: number
  setMapYear: (y: number) => void
  mapShowRegions: boolean
  setMapShowRegions: (v: boolean) => void

  // Notebook drawer (free-form Markdown notes saved to a local folder).
  notebookOpen: boolean
  setNotebookOpen: (v: boolean) => void
  activeNotebookFile: string | null
  setActiveNotebookFile: (name: string | null) => void

  // Learn (Greek & Hebrew) activity state.
  learnModule: LearnModule
  setLearnModule: (m: LearnModule) => void
  learnLanguage: LearnLanguage
  setLearnLanguage: (l: LearnLanguage) => void
  learnLessonIdx: number
  setLearnLessonIdx: (i: number) => void

  // Reading selection
  referenceEdition: string // numbering of book, chapter and selected verse
  primary: string // primary translation id
  parallels: string[] // additional translation ids shown side-by-side (incl. primary at [0])
  book: string
  chapter: number

  // Study features
  strongsVisible: boolean
  toggleStrongs: () => void
  interlinear: boolean
  toggleInterlinear: () => void
  interlinearEdition: string // '' = auto (Masoretic for OT, Critical for NT)
  setInterlinearEdition: (id: string) => void
  interlinearStack: string[] // translation ids stacked under each original word
  toggleInterlinearStack: (id: string) => void
  interlinearParses: boolean // show all Scripture-attested parses per word vs the single best guess
  toggleInterlinearParses: () => void
  selectedStrongs: string | null
  selectedOccurrence: SelectedOccurrence | null
  strongsBack: string[] // study-pane history (browser-style back/forward through looked-up words)
  strongsForward: string[]
  strongsNavBack: () => void
  strongsNavForward: () => void
  studyTab: StudyTab

  restoreSourceWords: boolean
  toggleSourceWords: () => void
  sourceWordTerms: SourceWordTerms
  setSourceTerm: (ids: string[], enabled: boolean) => void
  sourceWordSettingsOpen: boolean
  setSourceWordSettingsOpen: (open: boolean) => void

  // Bumped whenever notes/highlights change, to trigger re-fetch.
  userDataNonce: number
  bumpUserData: () => void

  // Navigation
  chronological: boolean
  toggleChronological: () => void
  scrollToVerse: number | null
  goToVerse: (book: string, chapter: number, verse: number, sourceEdition?: string) => void
  focusVerse: (book: string, chapter: number, verse: number, sourceEdition: string) => void
  openSearchHit: (hit: SearchHit) => void
  clearScroll: () => void

  // Actions
  goTo: (book: string, chapter: number, edition?: string) => void
  setPrimary: (id: string) => void
  setParallels: (ids: string[]) => void
  selectStrongs: (id: string | null, occurrence?: SelectedOccurrence) => void
  setStudyTab: (tab: StudyTab) => void
}

/** The edition whose native chapter numbers appear in the book navigator. */
export function readingEdition(s: Pick<AppState, 'book' | 'primary' | 'interlinear' | 'interlinearEdition'>, book = s.book): string {
  if (!s.interlinear) return s.primary
  if (BOOK_BY_ID[book]?.testament === 'OT') return s.interlinearEdition === 'LXX' ? 'LXX' : 'MT'
  return ['NA', 'TR', 'BYZ'].includes(s.interlinearEdition) ? s.interlinearEdition : 'NA'
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' }),
      activity: 'bible',
      setActivity: (activity) => set({ activity }),
      focusPersonId: null,
      focusPerson: (focusPersonId) => set({ focusPersonId, activity: 'genealogies' }),
      focusPlaceId: null,
      focusPlace: (focusPlaceId) => set({ focusPlaceId, activity: 'maps' }),
      clearFocus: () => set({ focusPersonId: null, focusPlaceId: null }),

      translations: [],
      setTranslations: (translations) => set((state) => {
        if (!translations.length) return { translations }
        const available = new Set(translations.map(t => t.id))
        const selected = state.parallels.filter(id => available.has(id))
        if (!selected.length) selected.push(translations[0].id)
        const primary = selected[0]
        const lostSource = state.referenceEdition.startsWith('imp_') && !available.has(state.referenceEdition)
        return { translations, primary, parallels: selected, ...(lostSource ? { referenceEdition: primary } : {}) }
      }),

      aboutOpen: false,
      setAboutOpen: (aboutOpen) => set({ aboutOpen }),

      assistantOpen: false,
      setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
      pendingContext: null,
      askAssistantAbout: (pendingContext) => set({ pendingContext, assistantOpen: true }),
      clearPendingContext: () => set({ pendingContext: null }),
      chatMessages: [],
      setChatMessages: (chatMessages) => set({ chatMessages }),

      activeVerse: null,
      setActiveVerse: (activeVerse) => set({ activeVerse }),
      activePerson: null,
      setActivePerson: (activePerson) => set({ activePerson }),
      activePlace: null,
      setActivePlace: (activePlace) => set({ activePlace }),
      activeEvent: null,
      setActiveEvent: (activeEvent) => set({ activeEvent }),

      mapYear: -1000,
      setMapYear: (mapYear) => set({ mapYear }),
      mapShowRegions: false,
      setMapShowRegions: (mapShowRegions) => set({ mapShowRegions }),

      notebookOpen: false,
      setNotebookOpen: (notebookOpen) => set({ notebookOpen }),
      activeNotebookFile: null,
      setActiveNotebookFile: (activeNotebookFile) => set({ activeNotebookFile }),

      learnModule: 'alphabet',
      setLearnModule: (learnModule) => set({ learnModule }),
      learnLanguage: 'greek',
      setLearnLanguage: (learnLanguage) => set({ learnLanguage }),
      learnLessonIdx: 0,
      setLearnLessonIdx: (learnLessonIdx) => set({ learnLessonIdx }),

      referenceEdition: '', // older saved passages used the primary translation’s numbering
      primary: 'KJV',
      parallels: ['KJV'],
      book: 'John',
      chapter: 1,

      strongsVisible: false,
      toggleStrongs: () => set({ strongsVisible: !get().strongsVisible }),
      interlinear: false,
      toggleInterlinear: () => set({ interlinear: !get().interlinear }),
      interlinearEdition: '',
      setInterlinearEdition: (interlinearEdition) => set({ interlinearEdition }),
      interlinearStack: [],
      toggleInterlinearStack: (id) => {
        const cur = get().interlinearStack
        set({ interlinearStack: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] })
      },
      interlinearParses: false,
      toggleInterlinearParses: () => set({ interlinearParses: !get().interlinearParses }),
      selectedStrongs: null,
      selectedOccurrence: null,
      strongsBack: [],
      strongsForward: [],
      strongsNavBack: () => {
        const { strongsBack, strongsForward, selectedStrongs } = get()
        if (!strongsBack.length) return
        set({
          selectedOccurrence: null,
          selectedStrongs: strongsBack[strongsBack.length - 1],
          studyTab: 'lexicon',
          strongsBack: strongsBack.slice(0, -1),
          strongsForward: selectedStrongs ? [...strongsForward, selectedStrongs] : strongsForward
        })
      },
      strongsNavForward: () => {
        const { strongsBack, strongsForward, selectedStrongs } = get()
        if (!strongsForward.length) return
        set({
          selectedOccurrence: null,
          selectedStrongs: strongsForward[strongsForward.length - 1],
          studyTab: 'lexicon',
          strongsForward: strongsForward.slice(0, -1),
          strongsBack: selectedStrongs ? [...strongsBack, selectedStrongs] : strongsBack
        })
      },
      studyTab: 'lexicon',

      restoreSourceWords: false,
      toggleSourceWords: () => set(state => ({ restoreSourceWords: !state.restoreSourceWords })),
      sourceWordTerms: {},
      setSourceTerm: (ids, enabled) => set(state => ({
        sourceWordTerms: { ...state.sourceWordTerms, ...Object.fromEntries(ids.map(id => [id, enabled])) }
      })),
      sourceWordSettingsOpen: false,
      setSourceWordSettingsOpen: (sourceWordSettingsOpen) => set({ sourceWordSettingsOpen }),

      userDataNonce: 0,
      bumpUserData: () => set({ userDataNonce: get().userDataNonce + 1 }),

      chronological: false,
      toggleChronological: () => set({ chronological: !get().chronological }),
      scrollToVerse: null,
      goToVerse: (book, chapter, verse, sourceEdition = 'KJV') => {
        const s = get()
        const available = mapPassage({ book, chapter, verse }, sourceEdition, readingEdition(s))
        const showSource = !available && s.translations.some((t) => t.id === sourceEdition)
        set({
          book, chapter, referenceEdition: sourceEdition, activeVerse: verse, scrollToVerse: verse, activity: 'bible',
          ...(showSource ? { primary: sourceEdition, parallels: [sourceEdition, ...s.parallels.slice(1)], interlinear: false } : {})
        })
      },
      focusVerse: (book, chapter, verse, referenceEdition) =>
        set({ book, chapter, referenceEdition, activeVerse: verse, scrollToVerse: null }),
      openSearchHit: (hit) => {
        const s = get()
        const translation = hit.translation ?? s.primary
        const edition = hit.edition ?? (['TR', 'NA', 'BYZ'].includes(translation) ? translation : undefined)
        // An interlinear edition has no parallel translation column.
        const reader = edition
          ? { interlinear: true, interlinearEdition: edition }
          : { interlinear: false, primary: translation, parallels: [translation, ...s.parallels.slice(1).filter((id) => id !== translation)] }
        set({
          ...reader, book: hit.book, chapter: hit.chapter, referenceEdition: edition ?? translation,
          activeVerse: hit.verse, scrollToVerse: hit.verse, activity: 'bible'
        })
      },
      clearScroll: () => set({ scrollToVerse: null }),

      goTo: (book, chapter, edition) => set({
        book, chapter, referenceEdition: edition ?? readingEdition(get(), book), activeVerse: null, scrollToVerse: null, activity: 'bible'
      }),
      setPrimary: (id) => get().setParallels([id, ...get().parallels.slice(1)]),
      setParallels: (ids) => {
        if (!ids.length) return
        set({ parallels: ids, primary: ids[0], referenceEdition: get().referenceEdition || get().primary })
      },
      selectStrongs: (id, occurrence) => {
        id = id && lexiconId(id)
        const cur = get().selectedStrongs
        if (id && id !== cur) {
          // Navigating to a new entry: remember where we were, clear the forward stack.
          set({
            selectedStrongs: id,
            selectedOccurrence: occurrence ?? null,
            studyTab: 'lexicon',
            strongsBack: cur ? [...get().strongsBack, cur] : get().strongsBack,
            strongsForward: []
          })
        } else if (!id) {
          set({ selectedStrongs: null, selectedOccurrence: null })
        } else {
          set({ selectedStrongs: id, selectedOccurrence: occurrence ?? null, studyTab: 'lexicon' })
        }
      },
      setStudyTab: (tab) => set({ studyTab: tab })
    }),
    {
      name: studyStorageKey(),
      version: 1,
      migrate: (saved) => {
        const previous = (saved ?? {}) as Partial<AppState> & {
          quickReplace?: boolean; quickReplaceConfig?: unknown; replacements?: unknown
        }
        const { quickReplace, quickReplaceConfig: _config, replacements: _manual, ...rest } = previous
        return { ...rest, restoreSourceWords: quickReplace === true, sourceWordTerms: {} }
      },
      // A detached window starts with the current reader context. Only the main window
      // owns the shared snapshot, including conversations and reading position.
      ...(typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('window') === 'notebook'
        ? { storage: createJSONStorage(() => ({
            getItem: (key) => window.localStorage.getItem(key),
            setItem: () => {},
            removeItem: () => {}
          })) }
        : {}),
      partialize: (s) => ({
        theme: s.theme,
        activity: s.activity,
        referenceEdition: s.referenceEdition,
        primary: s.primary,
        parallels: s.parallels,
        book: s.book,
        chapter: s.chapter,
        strongsVisible: s.strongsVisible,
        interlinear: s.interlinear,
        interlinearEdition: s.interlinearEdition,
        interlinearStack: s.interlinearStack,
        interlinearParses: s.interlinearParses,
        chronological: s.chronological,
        restoreSourceWords: s.restoreSourceWords,
        sourceWordTerms: s.sourceWordTerms,
        chatMessages: s.chatMessages,
        mapYear: s.mapYear,
        mapShowRegions: s.mapShowRegions,
        activeNotebookFile: s.activeNotebookFile,
        learnModule: s.learnModule,
        learnLanguage: s.learnLanguage
      })
    }
  )
)
