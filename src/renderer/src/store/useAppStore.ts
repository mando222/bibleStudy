import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Translation } from '@shared/types'

export type Theme = 'light' | 'dark'
export type StudyTab = 'lexicon' | 'notes' | 'search' | 'apparatus'

// One-click "restore the divine names": Strong's number → the name to render in place of the
// traditional English rendering (LORD → Yahweh, God → Elohim, …). Applied via the word-replace
// map, so it only affects translations that carry Strong's tags (KJV, BSB).
export const DIVINE_NAMES: Record<string, string> = {
  H3068: 'Yahweh', // יהוה — usually "LORD"
  H3069: 'Yahweh', // יהוה — "GOD" beside Adonai
  H3050: 'Yah', // יָהּ — "JAH"/"LORD"
  H136: 'Adonai', // אֲדֹנָי — "Lord"
  H410: 'El', // אֵל — "God"
  H430: 'Elohim', // אֱלֹהִים — "God"
  H433: 'Eloah', // אֱלוֹהַּ — "God"
  H7706: 'Shaddai', // שַׁדַּי — "Almighty"
  H5945: 'Elyon' // עֶלְיוֹן — "most High"
}

interface AppState {
  theme: Theme
  toggleTheme: () => void

  // Library
  translations: Translation[]
  setTranslations: (t: Translation[]) => void

  // About / credits modal
  aboutOpen: boolean
  setAboutOpen: (v: boolean) => void

  // AI assistant drawer
  assistantOpen: boolean
  setAssistantOpen: (v: boolean) => void

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
  selectedStrongs: string | null
  studyTab: StudyTab

  // Word-replace ("agape"): Strong's number → display text (lemma/translit), per session.
  replacements: Record<string, string>
  setReplacement: (strongs: string, text: string) => void
  clearReplacement: (strongs: string) => void
  clearReplacements: () => void
  divineNames: boolean
  toggleDivineNames: () => void

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

      translations: [],
      setTranslations: (translations) => set({ translations }),

      aboutOpen: false,
      setAboutOpen: (aboutOpen) => set({ aboutOpen }),

      assistantOpen: false,
      setAssistantOpen: (assistantOpen) => set({ assistantOpen }),

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
      selectedStrongs: null,
      studyTab: 'lexicon',

      replacements: {},
      setReplacement: (strongs, text) =>
        set({ replacements: { ...get().replacements, [strongs]: text } }),
      clearReplacement: (strongs) => {
        const next = { ...get().replacements }
        delete next[strongs]
        set({ replacements: next })
      },
      clearReplacements: () => set({ replacements: {}, divineNames: false }),

      divineNames: false,
      toggleDivineNames: () => {
        const on = !get().divineNames
        const next = { ...get().replacements }
        if (on) for (const [k, v] of Object.entries(DIVINE_NAMES)) next[k] = v
        else for (const k of Object.keys(DIVINE_NAMES)) delete next[k]
        set({ divineNames: on, replacements: next })
      },

      userDataNonce: 0,
      bumpUserData: () => set({ userDataNonce: get().userDataNonce + 1 }),

      chronological: false,
      toggleChronological: () => set({ chronological: !get().chronological }),
      scrollToVerse: null,
      goToVerse: (book, chapter, verse) => set({ book, chapter, scrollToVerse: verse }),
      clearScroll: () => set({ scrollToVerse: null }),

      goTo: (book, chapter) => set({ book, chapter, scrollToVerse: null }),
      setPrimary: (id) => {
        const parallels = [...get().parallels]
        parallels[0] = id
        set({ primary: id, parallels })
      },
      setParallels: (ids) => set({ parallels: ids, primary: ids[0] ?? get().primary }),
      selectStrongs: (id) =>
        set({ selectedStrongs: id, studyTab: id ? 'lexicon' : get().studyTab }),
      setStudyTab: (tab) => set({ studyTab: tab })
    }),
    {
      name: 'obs-app-state',
      partialize: (s) => ({
        theme: s.theme,
        primary: s.primary,
        parallels: s.parallels,
        book: s.book,
        chapter: s.chapter,
        strongsVisible: s.strongsVisible,
        interlinear: s.interlinear,
        interlinearEdition: s.interlinearEdition,
        chronological: s.chronological
      })
    }
  )
)
