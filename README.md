# Open Bible Study

A **local, offline, open-source** Bible study desktop app — a free "Logos-lite" for deep
original-language study. Everything runs on your machine; your notes and highlights stay yours.
Installers for **macOS, Windows, and Linux**.

## Features

**Reading**
- 📖 **Translations** — KJV, Berean Standard Bible, World English Bible, Young's Literal, Julia
  Smith (1876), plus the **Septuagint** (Greek OT) and **Masoretic Hebrew** as readable, searchable
  editions. **Parallel columns** with synced scrolling and a per-column translation picker.
- 🌗 Warm light / dark "paper" theme.
- **Reading display** has independent switches for literary layout, speaker guides, and structured
  passages. Set them for all columns or override one translation. Literary layout follows each
  edition's recorded paragraphs, poetry, headings, and superscriptions. Try **Psalm 23** with
  BSB and KJV, then choose **Compare layout**. An edition without markup stays in plain text.
- **Context** opens the cited people, places, and events for a chapter, verse, or selected range.
  **Map this passage** follows its place references. Reviewed study notes include the speakers
  and letter in Acts 15 and the generations in Matthew 1. Notes and labels do not alter quotations.

**Original languages**
- 🔢 **Strong's numbers** — toggle on/off; click any word (tagged or not) to open its lexicon entry.
- 🔤 **Interlinear** — word-by-word original with transliteration, Strong's, morphology and gloss;
  selectable base edition (Masoretic · Septuagint · Textus Receptus · Byzantine · Critical), stack
  translations under each word, and a "best guess ⇄ all Scripture-attested parses" toggle.
- 📚 **Lexicons** — Strong's plus scholarly **BDB · Abbott-Smith · LSJ**, with a full-verse
  **concordance** for every word.
- **Restore words** — select a word in the reader and use the right-hand lexicon panel to show its
  Hebrew, Aramaic or Greek form at verified occurrences. In BSB 1 John 2:1, G264 has two different
  forms. The reader keeps “you will not sin” with *ἁμάρτητε* and “does sin” with *ἁμάρτῃ*.
  The source details identify the publisher’s row. A translation without a verified link keeps
  its published wording. The toolbar also offers transliterated terms, including *ēgapēsen* for
  “loved” in BSB John 3:16. The verified four-letter Hebrew name appears as YHWH.
  Hover over a restored word, or focus it and press Down Arrow, to compare translations.
  Copies and assistant quotations use the published text.
- 🅰️ **Words tab** — browse the lexicon by number, transliteration, or meaning. Select an entry
  and open **Word frequency** to see where its Hebrew, Aramaic, or Greek forms occur. Each use
  counts once, even when the word occurs several times in a verse. Compare books by uses per
  1,000 tagged words or by total uses, then select a book and chapter to see the matching text.
  The map follows the selected original-language edition independently of your English translation.

**Textual apparatus**
- In **Settings → Preferred text order**, rank the three Greek New Testament editions, the
  Masoretic Text and Greek Septuagint, and the written (Ketiv) and read (Qere) forms.
  The automatic interlinear opens your highest-ranked available edition. Greek word-frequency
  maps also follow this preference until you select an edition for the map.
- **Variants** shows where the bundled Greek editions differ and where a Masoretic written and
  read pair is recorded. From a word in the right-hand Lexicon, **Compare source texts** shows
  the full verse in your preferred order. Try **John 1:18** to see which editions print “God”
  and which print “Son.” Each restored word in a translation still uses its own source link.
  A source note identifies readings whose word order could not be verified.

**People, places & history**
- 🌳 **Genealogies** — browse biblical people; click one to see their family and **every verse that
  mentions them**.
- 🗺️ **Maps** — search the whole offline atlas by name or alias, including unlocated places such as
  Nod. Select a located place to center it. Proposed sites, broad areas, and approximate historical
  boundaries are labeled. **Map a person** lists people with at least one location supported by a
  cited passage, including places whose coordinates are unknown. Paul in Acts 13 and Ruth and
  Naomi in Ruth 1 have numbered stops. Optional dotted lines show the order given in the passage.
- 🕰️ **Timelines** — biblical events in order, each linked to the passage that records it.

**Study**
- 🔎 **Search anything** — text, a **Strong's number** (`G26`, `H430`), or a **Greek/Hebrew word**
  (accents and points optional — `θεος` finds `θεὸς`).
- ✍️ **Notes & highlighting** — verse highlights and notes in a **separate** `user.sqlite`, so app
  updates never touch your data.
- **Back up or move your study work** in **About → Study backup**. Save the `.obsbackup` file, then restore it on the destination computer. Restore opens a new profile and keeps a recovery copy of the previous work.
- ✨ **AI assistant (opt-in, fully local)** — a grounded, offline study assistant that cites the
  verses it uses (clickable), links Greek/Hebrew words and Strong's numbers, answers "how do I…"
  questions about the app, lets you **select a passage and ask about it**, and does **RAG** over
  your own PDFs/notes + the verse corpus (semantic search). No account, no cloud.

## Tech

Electron 43 · React 18 · TypeScript · electron-vite · Tailwind CSS · Zustand · **`node:sqlite`**
(Node's built-in SQLite — no native module to compile) · `sqlite-vec` (vector search) ·
`node-llama-cpp` (bundled GGUF inference). Text lives in a bundled read-only
`resources/bible.sqlite`, built by the data pipeline; user data lives in a separate `user.sqlite`.

## Getting started

```bash
npm install          # no native builds required
npm run db:build     # download open data + build resources/bible.sqlite (a few minutes)
npm run dev          # launch the app
```

Other scripts: `npm run typecheck`, `npm test`, `npm run build` (compile), `npm run dist:mac`
(or `dist:win` / `dist:linux`) to build an installer. Releases are cut by bumping `version` in
`package.json` and pushing to `main` (CI gates on typecheck, tests, data integrity, and a
packaged-app smoke test on all three OSes). See [docs/RELEASING.md](docs/RELEASING.md) and
[docs/INSTALL.md](docs/INSTALL.md).

## Data & licensing

Only **public-domain / openly-licensed** data is bundled, each credited in the app's **About**
screen. Sources include the helloao Free Use Bible API, OpenScriptures Strong's (CC-BY-SA),
STEPBible **TAHOT/TAGNT** + **BDB/Abbott-Smith/LSJ** lexicons (CC-BY), the **Swete Septuagint** via
First1KGreek (CC-BY-SA), and **Theographic Bible Metadata** for people/places/events (CC-BY-SA,
place coordinates from OpenBible.info). Copyrighted, non-CATSS, and other closed sources are
deliberately excluded.

**NKJV and NASB are copyrighted and cannot be bundled** — the app includes an **importer** so users
who own them (MySword / e-Sword modules) can load their own licensed copies.

The application code is licensed under the [MIT License](LICENSE).
