# Open Bible Study

A **local, offline, open-source** Bible study desktop app — a free "Logos-lite" for deep
original-language study. Everything runs on your machine; your notes and highlights stay yours.

## Features (v1 reader core)

- 📖 **Multiple translations** — KJV, Berean Standard Bible (BSB), World English Bible (WEB), with
  **parallel side-by-side columns** and synced scrolling.
- 🔢 **Strong's numbers** — toggle on/off; click any word *or* number to open its Greek/Hebrew
  lexicon entry (785k KJV words tagged; 14,197-entry lexicon).
- 🔎 **Concordance word-study** — a Strong's entry lists *every* verse it appears in (canonical
  order, matched word highlighted); cross-linked references let you walk a word's roots.
- ✍️ **Notes & highlighting** — verse-level highlights in five colors and per-verse notes, stored
  in a **separate** `user.sqlite` so app updates never touch your data.
- 🔦 **Full-text search** — fast SQLite FTS5 across the whole library, with jump-to-verse.
- 🌗 **Light / dark** warm "paper" theme.

See the roadmap for what's next (original-language interlinear + the "agape" word-replace,
TR-vs-Critical apparatus, Masoretic Hebrew, a module importer for translations you own, and a
local AI research assistant with RAG over your own documents).

## Tech

Electron 43 · React 18 · TypeScript · electron-vite · Tailwind CSS · Zustand · **`node:sqlite`**
(Node's built-in SQLite — no native module to compile). Text lives in a bundled read-only
`resources/bible.sqlite`, built by the data pipeline.

## Getting started

```bash
npm install          # install dependencies (no native builds required)
npm run db:build     # download open Bible data and build resources/bible.sqlite (~1–2 min)
npm run dev          # launch the app
```

Other scripts: `npm run build` (compile), `npm run typecheck`, `npm run start` (preview a build).

## Data & licensing

Only public-domain / openly-licensed texts are bundled. See [docs/attribution.md](docs/attribution.md)
for full source credits (helloao Free Use Bible API, OpenScriptures Strong's dictionaries under
CC BY-SA, kaiserlik/kjv). **NKJV and NASB are copyrighted and cannot be bundled** — a later release
adds an importer so users who own them can load their own licensed copies.

The application code is licensed under the [MIT License](LICENSE).
