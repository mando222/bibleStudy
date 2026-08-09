// A small, authored "how to use Open Bible Study" corpus. The assistant retrieves the relevant
// section(s) by keyword so it can guide the user through the app with real steps rather than
// inventing menus. Kept in sync with the actual UI (TopBar toggles, the right-hand study pane,
// the verse-number menu, and the assistant drawer).

interface GuideSection {
  title: string
  keywords: string // extra synonyms to help matching
  body: string
}

export const APP_GUIDE: GuideSection[] = [
  {
    title: "Turn on Strong's numbers",
    keywords: "strongs number lexicon original word define definition dictionary tag",
    body: "Click the Strong's toggle (the superscript-number icon) in the top toolbar to show Strong's numbers over each tagged word. Click any word — or its number — to open its lexicon entry (definition, morphology, and every place it occurs) in the study pane on the right. Strong's are available for tagged translations like the KJV and BSB."
  },
  {
    title: "See the Greek or Hebrew (interlinear)",
    keywords: "greek hebrew original language interlinear word-by-word literal septuagint masoretic transliteration",
    body: "Click the Interlinear toggle in the top toolbar to show the passage word-by-word with the original Greek or Hebrew, transliteration, Strong's number, and gloss under each word. In the interlinear you can choose the base edition (Masoretic Hebrew, Septuagint, Textus Receptus, Byzantine, or the Critical text) and stack translations under each original word."
  },
  {
    title: "Interlinear: best guess vs all parses",
    keywords: "parse parsing morphology ambiguous forms grammar attested readings",
    body: "In the interlinear, toggle between the single best-guess parse and all Scripture-attested parses for each word. 'All parses' shows every reading a form actually takes across the scholar-tagged editions, with how often each occurs — nothing is machine-generated."
  },
  {
    title: "Compare translations side by side",
    keywords: "parallel translations columns compare versions add column kjv bsb web ylt",
    body: "Use the '+' (add a parallel translation) control in the top toolbar to add columns and read translations side by side. Columns scroll together. Remove a column with the × on its header."
  },
  {
    title: "Restore the divine names (LORD → Yahweh)",
    keywords: "divine names yahweh yhwh tetragrammaton lord god elohim adonai jehovah",
    body: "Click the Divine Names toggle (יהוה) in the top toolbar to render the divine name as Yahweh (and God as Elohim, etc.) instead of LORD. Use the pencil / customize button next to it to enable individual names or set your own rendering. This needs a Strong's-tagged translation such as the KJV or BSB."
  },
  {
    title: "Replace an English word with the original (agape mode)",
    keywords: "word replace agape overlay render original lemma every occurrence substitute",
    body: "Open a word's lexicon card (click the word with Strong's on), then use the replace control to show its original word — e.g. render 'love' as 'agape' — everywhere that Strong's number appears. Clear replacements from the bar above the reader."
  },
  {
    title: "Highlight and take notes",
    keywords: "highlight note annotate color margin verse menu save",
    body: "Click a verse's number to open its menu, then pick a highlight color or 'Add a note'. Notes and highlights are saved locally and stay with the verse. Your notes and highlights are preserved across app updates."
  },
  {
    title: "Search the Bible",
    keywords: "search find keyword full text fts phrase lookup",
    body: "Use the Search tab in the study pane to find words or phrases across the text. You can also ask the assistant to find where a theme or term appears — it searches by keyword and, once the semantic index is built, by meaning."
  },
  {
    title: "Read in chronological order",
    keywords: "chronological order reading history timeline sequence canonical",
    body: "Toggle chronological order in the navigation pane to reorder the books by approximate historical sequence instead of the standard canonical order. This changes only the reading order."
  },
  {
    title: "Add your own translation (e.g. NKJV or NASB)",
    keywords: "import translation nkjv nasb module mysword esword own copy copyright licensed",
    body: "Copyrighted translations like the NKJV and NASB can't be bundled, but you can import a copy you own (MySword or e-Sword modules) from the library/settings, and it will appear alongside the built-in translations."
  },
  {
    title: "Use the study assistant",
    keywords: "assistant ai chat ground question answer offline private cite documents",
    body: "Open the assistant with the sparkle button in the top toolbar. It runs privately on your computer, offline. Keep 'Ground answers in Scripture' on so replies are based on the passages it cites — the citations are clickable and jump to the verse. Use Stop to halt a reply, and Clear to start a new conversation."
  },
  {
    title: "Ask the assistant about a specific passage",
    keywords: "ask about selection highlight passage context verse question this",
    body: "Select any text in the reader and click the '✨ Ask' button that appears, or choose 'Ask the assistant' from a verse's menu. The passage is attached as context (shown as an 'About' pill in the assistant) so your question is answered about exactly those verses."
  },
  {
    title: "Add documents for the assistant",
    keywords: "documents pdf notes upload context rag retrieval add file semantic index build",
    body: "In the assistant, open the Documents panel to add your own PDF, text, or Markdown files. Checked documents are retrieved and used as context. You can also build a one-time semantic index of the Bible so the assistant can find verses by meaning, not just keywords."
  },
  {
    title: "Scholarly lexicons",
    keywords: "lexicon bdb abbott-smith lsj liddell scott brown driver briggs thayer greek hebrew",
    body: "The lexicon card in the study pane has tabs for the scholarly lexicons — Abbott-Smith and LSJ for Greek, BDB for Hebrew — each showing sense divisions with citations, keyed to the word's Strong's number."
  }
]

const STOP = new Set(
  'the a an of to in on at and or but is are was how do i my me you your what where when who can could show turn see get use using with for it this that'.split(
    ' '
  )
)

function terms(q: string): string[] {
  return [...new Set(q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/))].filter(
    (w) => w.length > 2 && !STOP.has(w)
  )
}

/**
 * Return the guide section(s) most relevant to a how-to question, or [] when the question
 * isn't really about using the app (so Bible Q&A isn't polluted with app-help text).
 */
export function retrieveGuide(query: string, k = 2): { text: string; source: string }[] {
  const ts = terms(query)
  if (!ts.length) return []
  const scored = APP_GUIDE.map((s) => {
    const title = s.title.toLowerCase()
    const kw = s.keywords.toLowerCase()
    const body = s.body.toLowerCase()
    let score = 0
    for (const t of ts) {
      if (title.includes(t)) score += 3
      else if (kw.includes(t)) score += 2
      else if (body.includes(t)) score += 1
    }
    return { s, score }
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
  if (!scored.length || scored[0].score < 3) return [] // require a solid match (a title or keyword hit)
  return scored.slice(0, k).map((x) => ({ text: `${x.s.title}\n${x.s.body}`, source: 'App guide' }))
}
