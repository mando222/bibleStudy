import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Translation } from '@shared/types'

export type Theme = 'light' | 'dark'
export type StudyTab = 'lexicon' | 'notes' | 'search' | 'apparatus'

interface AppState {
  theme: Theme
  toggleTheme: () => void

  // Library
  translations: Translation[]
  setTranslations: (t: Translation[]) => void

  // About / credits modal
  aboutOpen: boolean
  setAboutOpen: (v: boolean) => void

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
      clearReplacements: () => set({ replacements: {} }),

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
