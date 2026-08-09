# Open Bible Study — Roadmap

A living plan. **v1 is complete and shipping** (cross-platform installers, auto-built and
released by CI). This doc carries forward what was deliberately deferred and collects candidate
features to pull from next. Add ideas under **Backlog** freely; move an item to **In progress** when
we start it.

---

## ✅ Shipped (v1)

- **Reader** — KJV, BSB, WEB, YLT, Julia Smith; parallel columns; book/chapter nav; chronological
  (book-level) toggle; notes + highlighting; FTS search.
- **Original languages** — interlinear (word-by-word); selectable editions **Masoretic (WLC),
  Septuagint (Swete), Textus Receptus, Byzantine, Critical (NA/SBL)**; Hebrew RTL + fonts.
- **Study tools** — Strong's toggle + lexicon card + concordance; **multi-lexicon** (BDB /
  Abbott-Smith / LSJ); click any word (even untagged) → lexicon-by-form; **word-replace / original
  overlay** ("agape" mode); **Divine Names** toggle (per-name config, custom renderings);
  **TR-vs-Critical apparatus**; **"best guess ⇄ all parses"** (Scripture-attested ambiguity).
- **Septuagint** — Swete Greek OT (CC-BY-SA), 36 protocanon books, tagged to Strong's at ~84% by
  surface-matching the NT (no CATSS).
- **AI assistant (opt-in)** — bundled in-process model (node-llama-cpp) with **Fast/Balanced/Quality
  tiers** (Llama-3.2-1B / 3B / Qwen2.5-7B), auto-download, grounded Bible Q&A, low-temp + strict
  grounding; **RAG** over the verse corpus + user documents (sqlite-vec), document manager.
- **Extensibility** — import-your-own translation (MySword/e-Sword); About/Credits attribution.
- **Distribution** — macOS / Windows / Linux installers via electron-builder; **version-driven
  releases** (bump `package.json` → CI builds + publishes a GitHub Release with notes); app icon;
  data preserved across updates (user.sqlite migration scaffold).
- **Quality** — CI test suite gating every release: typecheck, unit tests, data-integrity test, and
  a packaged-app smoke test (boots + loads native deps) on all three OSes.

---

## ⏸️ Deferred (carried over — do when we choose to)

- **LXX full morphological tagging (84% → ~99%).** The open Koine analyzer (odyCy/spaCy) is
  installed and validated locally; run it as an offline batch to lemmatize the Swete text, map
  lemma→Strong's, and backfill. Would also give real morphology for every LXX word. *(Fidelity note:
  label as machine-generated; keep distinct from scholar tags.)*
- **LXX source gaps** — Ecclesiastes (absent in First1KGreek Swete) and Ezra/Nehemiah (the combined
  "Esdras B" needs a chapter-split). Source from another clean edition.
- **Cross-references** — none yet. The **Treasury of Scripture Knowledge is public domain** — a great
  clean source; wire refs as clickable `ScriptureRef`s.
- **Footnotes / translation notes** — clickable popovers where the data exists.
- **Morphology → plain English** — a popover that turns codes like `V-IAI-3S` into "verb, imperfect
  active indicative, 3rd person singular."
- **Passage-level chronological plan** — v1 reorders books; a true interleaved reading plan (Psalms
  within Samuel/Kings, Gospel harmony) needs a curated plan dataset.
- **Pronunciation audio** — Greek/Hebrew (and maybe English TTS).
- **Hebrew detail toggles** — cantillation / vowel-point show-hide for the Masoretic.
- **Code signing + auto-update** — Apple Developer ($99/yr) + a Windows cert remove the unsigned-app
  warning and enable in-app "update available" (electron-updater). Deferred for cost; not blocking a
  trial.
- **Design pass** — a formal design-critique + accessibility (WCAG) review before a wider release.

### Permanent constraints (not TODOs)
- **NKJV / NASB95** stay **import-only** — proprietary, can't be bundled. The importer is the lawful path.
- **CATSS-tagged LXX** stays import-only (NC + user-declaration license). Our open tagging is the bundled path.

---

## 🧭 Backlog — candidate features (pull from here)

Grouped by theme; unordered within a group. Add freely.

### Study & reading
- Bookmarks + reading history (data model exists; tables/UI not built yet).
- "Compare this verse in all translations" one-click action.
- Reading plans (daily / topical / chronological passage-level) with progress.
- More public-domain translations (ASV, Geneva 1599, Darby, Douay-Rheims, Brenton LXX English).
- Print / export a passage (PDF or clipboard) with or without Strong's.
- Verse-of-the-day / resume-where-you-left-off.

### Notes & personal data
- Note tags + a notes browser/search; markdown in notes; auto-linkified references.
- Export / import all user data (notes, highlights, bookmarks) to a JSON file (backup & move).
- Highlight manager (browse/filter by color); more highlight styles.
- Word-study "saved words" / personal vocabulary list.

### Original-language depth
- Reverse-interlinear (click an English word → its original + all its forms).
- Grammar/parsing help popovers (ties to the deferred morph-decoder).
- Septuagint deuterocanon as an optional module.
- LXX vs MT alignment view (where the Greek OT diverges from the Hebrew).

### AI assistant
- Persist chat history; per-note / per-passage "ask about this."
- Better retrieval (rerank, cite exact verses); optional larger/remote models for power users.
- Summarize a chapter / word-study assistant flows.

### Platform & polish
- Keyboard shortcuts + command palette.
- Remember window size/position; light/dark refinements; font-size controls.
- Rounded macOS-style app icon; better installer branding.
- Tablet/responsive layout.

### Bigger bets (need design/infra)
- Optional cloud sync of notes across devices (needs a backend + auth).
- Sharing (share a verse image / a note).
- Community/annotation layer.

---

## How we ship

- **Release:** bump `version` in `package.json`, commit, push to `main`. CI runs the full gate
  (types, tests, data integrity, packaged-app smoke on all 3 OSes) and only then builds installers +
  publishes a GitHub Release with notes. See `docs/RELEASING.md`.
- **Every push/PR** runs typecheck + unit tests (`.github/workflows/ci.yml`) for fast feedback.
- Installers and the unsigned-app first-launch steps: `docs/INSTALL.md`.
