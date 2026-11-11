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
    title: "Set your preferred text order",
    keywords: "global settings authority order rank preference editions source text manuscript textual variants critical byzantine textus receptus qere ketiv",
    body: "Open Settings in the top toolbar and use the arrows under Preferred text order. Choose an order for the Greek New Testament, the Old Testament texts, and the written and read Masoretic forms. The Variants panel and Compare source texts in the reader’s Lexicon show the recorded readings in this order. The automatic interlinear opens your highest-ranked available edition. Each translation’s restored words continue to follow its own verified source links."
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
    title: "Read poetry and compare passage layouts",
    keywords: "reading display literary layout poetry indentation paragraph heading superscription speakers quotation structured genealogy letter compare layout",
    body: "Open Reading display above the translation columns. Literary layout, Speaker guides, and Structured passages are independent switches. Apply them to all translations or choose a particular edition to override the defaults. With two or more columns open, choose Compare layout for a passage. Psalm 23 is a useful example: the BSB and KJV record different line layouts. A missing layout is left plain. Acts 15 includes reviewed speaker notes and a letter outline."
  },
  {
    title: "Map a passage or person",
    keywords: "atlas maps location unknown birthplace journey travel route passage context place map person Paul Ruth Naomi",
    body: "Choose Context in the reader or select a range of verses and choose Context. Map this passage opens its places and supporting verses in the offline atlas. Maps also searches by place name or alias. Map a person lists people with at least one location supported by a cited passage. Their Family profiles have a Map this person button. A place with unknown coordinates still has a reference card. Numbered stops and optional dotted lines show the order given in the passage. Try Paul in Acts 13:13–14 or Ruth and Naomi in Ruth 1."
  },
  {
    title: "Restore source words and the divine name",
    keywords: "restore words replace occurrences original form lexicon panel greek hebrew aramaic agape divine names yahweh yhwh tetragrammaton lord god elohim adonai jehovah",
    body: "Select a word in the reader. The right-hand lexicon panel lets you show its written form wherever the edition has a verified source link. Each occurrence uses its own source row. A translated phrase can keep its wording with the source form beside it. Restore words in the toolbar controls visibility, and Choose words to restore manages your choices. The verified four-letter Hebrew divine name displays as YHWH. Hover over a displayed source form or focus it and press Down Arrow to compare translations. Copies and assistant selections quote the published translation."
  },
  {
    title: "Highlight and take notes",
    keywords: "highlight note annotate color margin verse menu save",
    body: "Click a verse's number to open its menu, then pick a highlight color or 'Add a note'. Notes and highlights are saved locally and stay with the verse. Your notes and highlights are preserved across app updates."
  },
  {
    title: "Back up or restore your study work",
    keywords: "backup restore transfer move computer notebook files bookmarks learning progress",
    body: "Open About and find Study backup. Save backup creates an .obsbackup file. On the destination computer, choose Restore backup and restart. You can find your previous study work in the recovery backup shown before restart."
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
  },
  {
    title: "Word frequency in the Words tab",
    keywords: "heat map heatmap occurrences count distribution concentration inflected forms chapter frequency",
    body: "Open Words, select a lexicon entry, and open Word frequency. All forms of the entry are included by default. Choose a form to see where that spelling and grammatical analysis occur. The book map shows uses per 1,000 tagged words or total uses. Select a book and chapter to see the original words highlighted. Uses and verses are counted separately because a word can occur several times in one verse. Greek editions can be studied separately, regardless of the reading translation."
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
