import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Translation, ChatCitation } from '@shared/types'

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
  role: 'user' | 'assistant'
  content: string
  citations?: ChatCitation[]
}

// "Quick Replace" (render the ORIGINAL word in place of the traditional English rendering)
// lives in shared/, so the build-time validator can check the very same rules against the
// Hebrew morphology. Re-exported here because the UI has always imported it from the store.
import type { QuickReplaceConfig } from '@shared/quickReplace'
export type {
  QuickReplaceCategory,
  QuickReplaceItem,
  QuickReplaceConfig,
  ReplacedSurface,
  QuickReplaceToken,
  RenderedToken
} from '@shared/quickReplace'
export {
  QUICK_REPLACE_CATEGORIES,
  QUICK_REPLACE_LIST,
  quickReplaceApplies,
  applyQuickReplace,
  quickReplaceDropsArticle,
  stripTrailingArticle,
  stripFormLeadIn,
  renderQuickReplace,
  computeQuickReplacements
} from '@shared/quickReplace'

/** A passage the user picked (verse menu or text selection) to ask the assistant about. */
export interface PendingContext {
  book: string
  bookName: string
  chapter: number
  verse: number
  endVerse?: number // for a multi-verse selection
  text: string
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
  strongsBack: string[] // study-pane history (browser-style back/forward through looked-up words)
  strongsForward: string[]
  strongsNavBack: () => void
  strongsNavForward: () => void
  studyTab: StudyTab

  // Word-replace ("agape"): Strong's number → display text (lemma/translit), per session.
  replacements: Record<string, string>
  setReplacement: (strongs: string, text: string) => void
  clearReplacement: (strongs: string) => void
  clearReplacements: () => void
  quickReplace: boolean // master on/off
  toggleQuickReplace: () => void
  quickReplaceConfig: QuickReplaceConfig // per-term enable + custom rendering
  setQuickReplaceEnabled: (strongs: string, enabled: boolean) => void
  setQuickReplaceCustom: (strongs: string, custom: string) => void
  resetQuickReplace: () => void
  quickReplaceModalOpen: boolean
  setQuickReplaceModalOpen: (v: boolean) => void

  // Bumped whenever notes/highlights change, to trigger re-fetch.
  userDataNonce: number
  bumpUserData: () => void

  // Navigation
  chronological: boolean
  toggleChronological: () => void
  scrollToVerse: number | null
  goToVerse: (book: string, chapter: number, verse: number) => void
  clearScroll: () => void

  // Actions
  goTo: (book: string, chapter: number) => void
  setPrimary: (id: string) => void
  setParallels: (ids: string[]) => void
  selectStrongs: (id: string | null) => void
  setStudyTab: (tab: StudyTab) => void
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
      setTranslations: (translations) => set({ translations }),

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
      strongsBack: [],
      strongsForward: [],
      strongsNavBack: () => {
        const { strongsBack, strongsForward, selectedStrongs } = get()
        if (!strongsBack.length) return
        set({
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
          selectedStrongs: strongsForward[strongsForward.length - 1],
          studyTab: 'lexicon',
          strongsForward: strongsForward.slice(0, -1),
          strongsBack: selectedStrongs ? [...strongsBack, selectedStrongs] : strongsBack
        })
      },
      studyTab: 'lexicon',

      replacements: {},
      setReplacement: (strongs, text) =>
        set({ replacements: { ...get().replacements, [strongs]: text } }),
      clearReplacement: (strongs) => {
        const next = { ...get().replacements }
        delete next[strongs]
        set({ replacements: next })
      },
      clearReplacements: () => set({ replacements: {} }),

      quickReplace: false,
      toggleQuickReplace: () => set({ quickReplace: !get().quickReplace }),
      quickReplaceConfig: {},
      setQuickReplaceEnabled: (strongs, enabled) =>
        set({
          quickReplaceConfig: {
            ...get().quickReplaceConfig,
            [strongs]: { enabled, custom: get().quickReplaceConfig[strongs]?.custom ?? '' }
          }
        }),
      setQuickReplaceCustom: (strongs, custom) =>
        set({
          quickReplaceConfig: {
            ...get().quickReplaceConfig,
            [strongs]: { enabled: get().quickReplaceConfig[strongs]?.enabled ?? true, custom }
          }
        }),
      resetQuickReplace: () => set({ quickReplaceConfig: {} }),
      quickReplaceModalOpen: false,
      setQuickReplaceModalOpen: (quickReplaceModalOpen) => set({ quickReplaceModalOpen }),

      userDataNonce: 0,
      bumpUserData: () => set({ userDataNonce: get().userDataNonce + 1 }),

      chronological: false,
      toggleChronological: () => set({ chronological: !get().chronological }),
      scrollToVerse: null,
      goToVerse: (book, chapter, verse) =>
        set({ book, chapter, activeVerse: verse, scrollToVerse: verse, activity: 'bible' }),
      clearScroll: () => set({ scrollToVerse: null }),

      goTo: (book, chapter) => set({ book, chapter, activeVerse: null, scrollToVerse: null, activity: 'bible' }),
      setPrimary: (id) => {
        const parallels = [...get().parallels]
        parallels[0] = id
        set({ primary: id, parallels })
      },
      setParallels: (ids) => set({ parallels: ids, primary: ids[0] ?? get().primary }),
      selectStrongs: (id) => {
        const cur = get().selectedStrongs
        if (id && id !== cur) {
          // Navigating to a new entry: remember where we were, clear the forward stack.
          set({
            selectedStrongs: id,
            studyTab: 'lexicon',
            strongsBack: cur ? [...get().strongsBack, cur] : get().strongsBack,
            strongsForward: []
          })
        } else if (!id) {
          set({ selectedStrongs: null })
        } else {
          set({ selectedStrongs: id, studyTab: 'lexicon' })
        }
      },
      setStudyTab: (tab) => set({ studyTab: tab })
    }),
    {
      name: 'obs-app-state',
      partialize: (s) => ({
        theme: s.theme,
        activity: s.activity,
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
        quickReplace: s.quickReplace,
        quickReplaceConfig: s.quickReplaceConfig,
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
