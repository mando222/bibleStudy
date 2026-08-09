import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Translation } from '@shared/types'

export type Theme = 'light' | 'dark'
export type StudyTab = 'lexicon' | 'notes' | 'search' | 'apparatus'

// "Restore the divine names": render the Hebrew names in place of their traditional English
// forms (LORD → Yahweh, God → Elohim, …). Applied through the word-replace map, so it only
// affects translations that carry Strong's tags (KJV, BSB). Each name can be toggled and its
// rendering customised; the whole thing persists across restarts.
export interface DivineName {
  strongs: string
  hebrew: string // lemma glyph, for the settings UI
  traditional: string // the usual English rendering
  default: string // our default replacement
}
export const DIVINE_NAMES_LIST: DivineName[] = [
  { strongs: 'H3068', hebrew: 'יהוה', traditional: 'LORD', default: 'Yahweh' },
  { strongs: 'H3069', hebrew: 'יהוה', traditional: 'GOD', default: 'Yahweh' },
  { strongs: 'H3050', hebrew: 'יָהּ', traditional: 'JAH', default: 'Yah' },
  { strongs: 'H136', hebrew: 'אֲדֹנָי', traditional: 'Lord', default: 'Adonai' },
  { strongs: 'H410', hebrew: 'אֵל', traditional: 'God', default: 'El' },
  { strongs: 'H430', hebrew: 'אֱלֹהִים', traditional: 'God', default: 'Elohim' },
  { strongs: 'H433', hebrew: 'אֱלוֹהַּ', traditional: 'God', default: 'Eloah' },
  { strongs: 'H7706', hebrew: 'שַׁדַּי', traditional: 'Almighty', default: 'Shaddai' },
  { strongs: 'H5945', hebrew: 'עֶלְיוֹן', traditional: 'most High', default: 'Elyon' }
]

export type DivineNameConfig = Record<string, { enabled: boolean; custom: string }>

/** The Strong's→text entries contributed by the divine-names feature (empty when master is off). */
export function computeDivineReplacements(on: boolean, cfg: DivineNameConfig): Record<string, string> {
  const out: Record<string, string> = {}
  if (!on) return out
  for (const dn of DIVINE_NAMES_LIST) {
    const c = cfg[dn.strongs]
    if (c && c.enabled === false) continue
    out[dn.strongs] = c?.custom?.trim() || dn.default
  }
  return out
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
  divineNames: boolean // master on/off
  toggleDivineNames: () => void
  divineNameConfig: DivineNameConfig // per-name enable + custom rendering
  setDivineNameEnabled: (strongs: string, enabled: boolean) => void
  setDivineNameCustom: (strongs: string, custom: string) => void
  resetDivineNames: () => void
  divineNamesModalOpen: boolean
  setDivineNamesModalOpen: (v: boolean) => void

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
      clearReplacements: () => set({ replacements: {} }),

      divineNames: false,
      toggleDivineNames: () => set({ divineNames: !get().divineNames }),
      divineNameConfig: {},
      setDivineNameEnabled: (strongs, enabled) =>
        set({
          divineNameConfig: {
            ...get().divineNameConfig,
            [strongs]: { enabled, custom: get().divineNameConfig[strongs]?.custom ?? '' }
          }
        }),
      setDivineNameCustom: (strongs, custom) =>
        set({
          divineNameConfig: {
            ...get().divineNameConfig,
            [strongs]: { enabled: get().divineNameConfig[strongs]?.enabled ?? true, custom }
          }
        }),
      resetDivineNames: () => set({ divineNameConfig: {} }),
      divineNamesModalOpen: false,
      setDivineNamesModalOpen: (divineNamesModalOpen) => set({ divineNamesModalOpen }),

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
        chronological: s.chronological,
        divineNames: s.divineNames,
        divineNameConfig: s.divineNameConfig
      })
    }
  )
)
