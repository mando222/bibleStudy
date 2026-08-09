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

### App icon — sourced, but verify end-to-end + wire the runtime window
Audit (2026-08-09):
- ✅ `build/icon.png` (1024×1024) is committed and `directories.buildResources: build` is set, so
  electron-builder **auto-generates** the packaged icons from it — mac `.icns`, Windows `.ico`, Linux
  png set. The *packaged* app icon should therefore be correct.
- ⚠️ **Never verified in a produced installer** — no release has been cut since the icon landed, so no
  one has confirmed the generated `.icns`/`.ico` actually show on the installed app / dock / taskbar.
  Confirm on the next `workflow_dispatch` build before a real release.
- ❌ **Dev + Linux runtime window icon not wired** — `BrowserWindow` sets no `icon:`, so `npm run dev`
  and the Linux window/taskbar fall back to the default Electron icon. Add `icon` to `BrowserWindow`
  (and optionally `app.dock.setIcon()` on macOS dev).
- (minor) No favicon in `src/renderer/index.html` — cosmetic for a desktop window (the OS uses the app
  icon, not the HTML favicon), but add one for completeness.

### Permanent constraints (not TODOs)
- **NKJV / NASB95** stay **import-only** — proprietary, can't be bundled. The importer is the lawful path.
- **CATSS-tagged LXX** stays import-only (NC + user-declaration license). Our open tagging is the bundled path.

---

## 🧭 Backlog — candidate features (pull from here)

Grouped by theme; unordered within a group. Add freely. For *content* features (commentaries,
dictionaries, word-study, maps), see the **Logos parity — gap analysis** section below — it's the
home for those, grouped by how license-clean each is.

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
- **Multiple tabs / parallel study sessions** (structural — see design sketch below).
- **Verify + wire the app icon everywhere** (see the App-icon task under Deferred).
- Keyboard shortcuts + command palette.
- Remember window size/position; light/dark refinements; font-size controls.
- Rounded macOS-style app icon; better installer branding.
- Tablet/responsive layout.

### Bigger bets (need design/infra)
- Optional cloud sync of notes across devices (needs a backend + auth).
- Sharing (share a verse image / a note).
- Community/annotation layer.

---

## 🗂️ Multiple tabs / parallel studies  *(proposed — next structural feature)*

Goal: keep several independent studies open at once and switch between them like browser tabs —
e.g. one tab in Romans with KJV+Greek stacked and the lexicon open on G26, another in Genesis
reading the Masoretic, a third comparing translations of John 3:16.

**What a "tab" is** — a self-contained *study session*: current book/chapter (+ scroll position),
the translation stack + active translation, Strong's on/off, interlinear settings (stack,
best-guess ⇄ all-parses), Divine-Names state, and the study-pane state (which word / Strong's /
lexicon is open). **Notes & highlights stay global** — they belong to verses, not tabs, so every
tab sees the same annotations for a verse.

**Architecture** — today the store holds a single reading context. Refactor to
`sessions: StudySession[]` + `activeTabId`; the reading/study slices read & write *the active
session*. Each `StudySession` is a serializable snapshot, so:
- persist `sessions` + `activeTabId` (existing `partialize`) → tabs **restore on relaunch**;
- new / close / reorder / rename tabs; **duplicate-tab = clone the snapshot** (great for
  "branch this study and compare").

**UI** — a tab strip above the reader, title auto-derived ("Rom 8 · KJV+Grk"). `Cmd/Ctrl+T` new,
`Cmd/Ctrl+W` close, `Cmd/Ctrl+1..9` jump, drag to reorder, middle-click / × to close; optional
"reopen closed tab."

**Scope call** — v1: reading + study-tool state per tab; the **AI chat + document manager stay
global** (one assistant). Later: an optional per-tab AI thread ("ask about *this* study").

**Stretch — split view:** we already use `react-resizable-panels`; a "split" that shows two
sessions side-by-side (not just switch) is a natural follow-on. Ship tabs first, split later.

**Effort:** medium — mostly a store refactor (single slice → array of sessions) + the tab strip.
No data-model / DB changes.

---

## 📚 Logos parity — what they have that we don't  *(gap analysis)*

Logos is a paid research platform; much of its power is a huge **paid library** + several
**proprietary datasets** we can't (and don't want to) replicate. But a surprising amount maps onto
**public-domain / open** sources we *can* bundle, or onto tools we can build on data we **already
ship**. Grouped by how reachable each is for us:

### 🟢 Clean wins — public-domain / open data we can bundle
| Logos feature | Our open equivalent | Notes |
|---|---|---|
| Commentaries (whole shelf) | Matthew Henry, JFB, Barnes, Gill, Calvin, Clarke — all **PD** (CCEL / SWORD) | Verse-keyed; drop into the study pane. **Biggest single content gap.** |
| Bible dictionaries / encyclopedias | Easton's, **ISBE (1915)**, Smith's — **PD** | Powers a "Factbook-lite" + word/name lookups. |
| Cross-references | **Treasury of Scripture Knowledge** — PD (already deferred) | Clickable `ScriptureRef`s. |
| Topical index | **Nave's Topical Bible**, Torrey's — PD | "Everything on *grace*." |
| Atlas / maps | openbible.info geodata (CC-BY) + PD historical maps | Interactive place lookup; ties to Factbook. |
| Timeline / biblical events | Build from PD chronology data | Events → passages. |
| More translations | ASV, Geneva 1599, Darby, Douay-Rheims, Brenton LXX EN — PD | Already in backlog. |

### 🟡 Feasible now — tools over data we already ship
| Logos feature | We already have… | Build |
|---|---|---|
| **Bible Word Study** "translation ring" | `verse_tokens.strongs` + aligned translations | How one Strong's is rendered across versions + every occurrence. |
| **Reverse interlinear** | BSB alignment | Click an English word → original + all its forms (backlog). |
| **Morphology search** | `morph` on every tagged token | Search by grammatical form ("all aorist imperatives"). |
| **Text-comparison tool** | parallel translations + apparatus | Word-level diff across versions for a verse. |
| **Passage Guide-lite** | reader + (added) cross-refs / commentary / dict | One panel aggregating everything for a passage. |
| **Exegetical Guide-lite** | interlinear + lexicons + parses | Word-by-word original with morph + gloss (mostly built). |
| Morphology → plain English | `morph` codes | Decoder popover (already deferred). |

### 🟠 Proprietary datasets — import-only or skip
- **Louw–Nida semantic domains** / UBS dictionaries — licensed; import-only at best.
- **Syntax / discourse databases** (Cascadia, Andersen–Forbes, Lexham) — proprietary; skip.
- **Logos Factbook / Atlas / Media** *as datasets* — their curation is proprietary; we build a
  *lite* version from the PD sources in 🟢 instead.
- **NKJV / NASB & other © translations** — import-only (already a permanent constraint).

### 🔵 Out of scope by design (or big bets)
- **Cloud sync + mobile + web** — we're deliberately **local-first / offline**; sync is a "bigger
  bet" already in the backlog, mobile/web aren't planned.
- **Community / Faithlife, sharing, sermon marketplace, courses** — not our lane.
- **Sentence diagramming / Canvas** — large effort, niche; possible far-future.
- **Sermon / preaching builder, prayer lists, guided workflows** — could arrive later as "study
  workflows."

**Takeaway — highest-leverage, license-clean gaps to close first:** **commentaries**, **Bible
dictionaries (Factbook-lite)**, **cross-references (TSK)**, and a **Bible Word Study** panel —
each is either PD data or built on data we already ship.

---

## How we ship

- **Release:** bump `version` in `package.json`, commit, push to `main`. CI runs the full gate
  (types, tests, data integrity, packaged-app smoke on all 3 OSes) and only then builds installers +
  publishes a GitHub Release with notes. See `docs/RELEASING.md`.
- **Every push/PR** runs typecheck + unit tests (`.github/workflows/ci.yml`) for fast feedback.
- Installers and the unsigned-app first-launch steps: `docs/INSTALL.md`.
