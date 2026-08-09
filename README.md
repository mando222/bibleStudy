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

**Original languages**
- 🔢 **Strong's numbers** — toggle on/off; click any word (tagged or not) to open its lexicon entry.
- 🔤 **Interlinear** — word-by-word original with transliteration, Strong's, morphology and gloss;
  selectable base edition (Masoretic · Septuagint · Textus Receptus · Byzantine · Critical), stack
  translations under each word, and a "best guess ⇄ all Scripture-attested parses" toggle.
- 📚 **Lexicons** — Strong's plus scholarly **BDB · Abbott-Smith · LSJ**, with a full-verse
  **concordance** for every word.
- 🔁 **Quick Replace** — render the *original* word in place of the English (LORD → Yahweh, love →
  agape, Christ → Christos), grouped by theme and fully configurable.
- 🅰️ **Words tab** — hand-browse the entire Greek & Hebrew lexicon by number, transliteration, or
  meaning.

**Textual apparatus**
- 🔀 **Variants** — where the Greek NT editions differ (Critical vs Textus Receptus), and the OT
  **Ketiv/Qere** (written vs read) scribal readings from the Masoretic tradition.

**People, places & history**
- 🌳 **Genealogies** — browse biblical people; click one to see their family and **every verse that
  mentions them**.
- 🗺️ **Maps** — the places of Scripture plotted by coordinates; click one for its verses (offline).
- 🕰️ **Timelines** — biblical events in order, each linked to the passage that records it.

**Study**
- 🔎 **Search anything** — text, a **Strong's number** (`G26`, `H430`), or a **Greek/Hebrew word**
  (accents and points optional — `θεος` finds `θεὸς`).
- ✍️ **Notes & highlighting** — verse highlights and notes in a **separate** `user.sqlite`, so app
  updates never touch your data.
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
