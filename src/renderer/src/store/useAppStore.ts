import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Translation, ChatCitation } from '@shared/types'

export type Theme = 'light' | 'dark'
export type StudyTab = 'lexicon' | 'notes' | 'search' | 'apparatus'
/** Far-right workspace tabs. 'bible' is the reader; the rest are their own full-window views. */
export type Activity = 'bible' | 'genealogies' | 'timelines' | 'maps' | 'words'

/** One turn in the assistant transcript (persisted so a conversation survives a restart). */
export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  citations?: ChatCitation[]
}

// "Quick Replace": render the ORIGINAL word (its transliteration) in place of the traditional
// English rendering — LORD → Yahweh, love → agape, Christ → Christos. It only ever shows the
// original text, never a new interpretation. Applied through the word-replace map, so it affects
// translations that carry Strong's tags (KJV, BSB). Each term can be toggled and its rendering
// customised; divine names are on by default, everything else is opt-in. Persists across restarts.
export type QuickReplaceCategory =
  | 'divine'
  | 'jesus'
  | 'love'
  | 'marriage'
  | 'satan'
  | 'afterlife'
  | 'other'

export const QUICK_REPLACE_CATEGORIES: { id: QuickReplaceCategory; label: string }[] = [
  { id: 'divine', label: 'Divine names' },
  { id: 'jesus', label: 'Jesus & his titles' },
  { id: 'love', label: 'Love' },
  { id: 'marriage', label: 'Marriage' },
  { id: 'satan', label: 'Satan & evil' },
  { id: 'afterlife', label: 'Heaven & hell' },
  { id: 'other', label: 'Other key terms' }
]

export interface QuickReplaceItem {
  strongs: string
  glyph: string // original-language lemma glyph, for the settings UI
  traditional: string // the usual English rendering
  default: string // default replacement — always the ORIGINAL word, transliterated
  category: QuickReplaceCategory
  defaultOn?: boolean // divine names default on (preserves prior behaviour); others opt-in
}

export const QUICK_REPLACE_LIST: QuickReplaceItem[] = [
  // Divine names (Hebrew) — on by default
  { strongs: 'H3068', glyph: 'יהוה', traditional: 'LORD', default: 'Yahweh', category: 'divine', defaultOn: true },
  { strongs: 'H3069', glyph: 'יהוה', traditional: 'GOD', default: 'Yahweh', category: 'divine', defaultOn: true },
  { strongs: 'H3050', glyph: 'יָהּ', traditional: 'JAH', default: 'Yah', category: 'divine', defaultOn: true },
  { strongs: 'H136', glyph: 'אֲדֹנָי', traditional: 'Lord', default: 'Adonai', category: 'divine', defaultOn: true },
  { strongs: 'H410', glyph: 'אֵל', traditional: 'God', default: 'El', category: 'divine', defaultOn: true },
  { strongs: 'H430', glyph: 'אֱלֹהִים', traditional: 'God', default: 'Elohim', category: 'divine', defaultOn: true },
  { strongs: 'H433', glyph: 'אֱלוֹהַּ', traditional: 'God', default: 'Eloah', category: 'divine', defaultOn: true },
  { strongs: 'H7706', glyph: 'שַׁדַּי', traditional: 'Almighty', default: 'Shaddai', category: 'divine', defaultOn: true },
  { strongs: 'H5945', glyph: 'עֶלְיוֹן', traditional: 'most High', default: 'Elyon', category: 'divine', defaultOn: true },
  // Jesus & his titles (Greek) — original forms, not reinterpretations
  { strongs: 'G2424', glyph: 'Ἰησοῦς', traditional: 'Jesus', default: 'Yeshua', category: 'jesus' },
  { strongs: 'G5547', glyph: 'Χριστός', traditional: 'Christ', default: 'Christos', category: 'jesus' },
  { strongs: 'G2962', glyph: 'κύριος', traditional: 'Lord', default: 'Kyrios', category: 'jesus' },
  { strongs: 'G1694', glyph: 'Ἐμμανουήλ', traditional: 'Emmanuel', default: 'Immanuel', category: 'jesus' },
  { strongs: 'G3056', glyph: 'λόγος', traditional: 'Word', default: 'Logos', category: 'jesus' },
  // Love
  { strongs: 'G26', glyph: 'ἀγάπη', traditional: 'love', default: 'agape', category: 'love' },
  { strongs: 'G25', glyph: 'ἀγαπάω', traditional: 'love', default: 'agapao', category: 'love' },
  { strongs: 'G5368', glyph: 'φιλέω', traditional: 'love', default: 'phileo', category: 'love' },
  { strongs: 'G5373', glyph: 'φιλία', traditional: 'friendship', default: 'philia', category: 'love' },
  { strongs: 'H160', glyph: 'אַהֲבָה', traditional: 'love', default: 'ahavah', category: 'love' },
  { strongs: 'H157', glyph: 'אָהֵב', traditional: 'love', default: 'ahav', category: 'love' },
  { strongs: 'H2617', glyph: 'חֶסֶד', traditional: 'lovingkindness', default: 'chesed', category: 'love' },
  // Marriage
  { strongs: 'G1062', glyph: 'γάμος', traditional: 'marriage', default: 'gamos', category: 'marriage' },
  { strongs: 'G3565', glyph: 'νύμφη', traditional: 'bride', default: 'nymphe', category: 'marriage' },
  { strongs: 'G3566', glyph: 'νυμφίος', traditional: 'bridegroom', default: 'nymphios', category: 'marriage' },
  // Satan & evil
  { strongs: 'H7854', glyph: 'שָׂטָן', traditional: 'Satan', default: 'satan', category: 'satan' },
  { strongs: 'G4567', glyph: 'Σατανᾶς', traditional: 'Satan', default: 'Satanas', category: 'satan' },
  { strongs: 'G1228', glyph: 'διάβολος', traditional: 'devil', default: 'diabolos', category: 'satan' },
  { strongs: 'G954', glyph: 'Βεελζεβούλ', traditional: 'Beelzebub', default: 'Beelzeboul', category: 'satan' },
  { strongs: 'H1100', glyph: 'בְּלִיַּעַל', traditional: 'Belial', default: 'Belial', category: 'satan' },
  { strongs: 'H5175', glyph: 'נָחָשׁ', traditional: 'serpent', default: 'nachash', category: 'satan' },
  // Heaven & hell
  { strongs: 'H8064', glyph: 'שָׁמַיִם', traditional: 'heaven', default: 'shamayim', category: 'afterlife' },
  { strongs: 'G3772', glyph: 'οὐρανός', traditional: 'heaven', default: 'ouranos', category: 'afterlife' },
  { strongs: 'H7585', glyph: 'שְׁאוֹל', traditional: 'hell / grave', default: 'sheol', category: 'afterlife' },
  { strongs: 'G86', glyph: 'ᾅδης', traditional: 'hell', default: 'hades', category: 'afterlife' },
  { strongs: 'G1067', glyph: 'γέεννα', traditional: 'hell', default: 'gehenna', category: 'afterlife' },
  // Other key terms
  { strongs: 'H7307', glyph: 'רוּחַ', traditional: 'Spirit', default: 'ruach', category: 'other' },
  { strongs: 'G4151', glyph: 'πνεῦμα', traditional: 'Spirit', default: 'pneuma', category: 'other' },
  { strongs: 'G5485', glyph: 'χάρις', traditional: 'grace', default: 'charis', category: 'other' },
  { strongs: 'G4102', glyph: 'πίστις', traditional: 'faith', default: 'pistis', category: 'other' },
  { strongs: 'H7965', glyph: 'שָׁלוֹם', traditional: 'peace', default: 'shalom', category: 'other' },
  { strongs: 'G1515', glyph: 'εἰρήνη', traditional: 'peace', default: 'eirene', category: 'other' },
  { strongs: 'H1285', glyph: 'בְּרִית', traditional: 'covenant', default: 'berith', category: 'other' },
  { strongs: 'G1242', glyph: 'διαθήκη', traditional: 'covenant', default: 'diatheke', category: 'other' },
  { strongs: 'G1391', glyph: 'δόξα', traditional: 'glory', default: 'doxa', category: 'other' },
  { strongs: 'H3519', glyph: 'כָּבוֹד', traditional: 'glory', default: 'kavod', category: 'other' }
]

export type QuickReplaceConfig = Record<string, { enabled: boolean; custom: string }>

/** The Strong's→text entries contributed by Quick Replace (empty when the master toggle is off). */
export function computeQuickReplacements(
  on: boolean,
  cfg: QuickReplaceConfig
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!on) return out
  for (const item of QUICK_REPLACE_LIST) {
    const c = cfg[item.strongs]
    const enabled = c ? c.enabled : !!item.defaultOn
    if (!enabled) continue
    out[item.strongs] = c?.custom?.trim() || item.default
  }
  return out
}

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
        set({ book, chapter, scrollToVerse: verse, activity: 'bible' }),
      clearScroll: () => set({ scrollToVerse: null }),

      goTo: (book, chapter) => set({ book, chapter, scrollToVerse: null }),
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
        chatMessages: s.chatMessages
      })
    }
  )
)
