# Changelog

All notable changes to Open Bible Study are recorded here. This file is written **for humans** —
each entry says, in plain language, what changed and why it matters to someone using the app.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (`MAJOR.MINOR.PATCH`). Releases are
tagged and named `vMAJOR.MINOR.PATCH` (e.g. `v0.1.2`). See [docs/RELEASING.md](docs/RELEASING.md)
for how a release is cut — **every release must add a dated section here before the version is
bumped.**

Group changes under: **Added** (new features), **Changed** (changes to existing behavior),
**Fixed** (bug fixes), **Removed** (removed features), **Deprecated**, **Security**.

## [Unreleased]

_Nothing yet._

## [0.2.1] - 2026-08-11

### Added

- **American Standard Version (1901).** The ancestor of the NASB, ESV and the World English Bible
  already included here, added for comparison rather than for easy reading. It renders the divine
  name as "Jehovah" (5,821 verses, against 7 in the KJV), transliterates *Sheol* and *Hades* instead
  of flattening both to "hell", and follows the critical text — so reading it beside the KJV shows
  you, verse by verse, where the two textual traditions differ. It uses KJV verse numbering, so it
  lines up in a parallel column.

### Fixed

- **macOS no longer reports the app as "damaged".** Downloads were arriving with an invalid
  signature, so macOS refused them outright with a dialog whose only real button was *Move to
  Trash* — and the usual right-click → Open workaround could not clear it. The app is now signed,
  so you get the ordinary "unidentified developer" warning instead, which right-click → **Open**
  clears in one step. (The warning itself can only be removed with a paid Apple Developer
  certificate.) If you already have 0.2.0 installed and stuck, 0.2.1 fixes it.
- **Install instructions corrected.** They previously advertised an Intel Mac download that has
  never existed — the published Mac build is Apple Silicon only — and recommended a workaround that
  could not work on the affected versions.

## [0.2.0] - 2026-08-11

### Added

- **Update notifications.** The app can now tell you when a newer version has been released, with a
  one-click button that opens the right installer for your computer. It asks GitHub at most once a
  day, sends nothing about you, and stays completely silent when you're offline. There's a switch
  for it (and a "Check now" button) under **About** — turn it off and the app makes no network
  request at all. Everything else remains fully offline.

### Fixed

- **Scripture text is no longer altered when Strong's numbers or Quick Replace are switched on.**
  The reader builds those views from word-level tagging data, and that data came from third-party
  sources with real gaps — so roughly 3,000 KJV verses silently lost their last word or two (Acts
  3:1 ended "…being the ninth", dropping "hour."), Psalm superscriptions appeared as raw
  `[[Shiggaion of David…]]` markup, and the Berean text showed translator brackets and `. . .`
  placeholders. The word tagging is now reconciled against the actual verse text at build time, so
  what you read is identical whether or not the study layers are on. Verified across all 62,000+
  tagged verses, and locked in by a build-time check.
- **Stray paragraph marks removed from the KJV.** About 2,970 verses began with a leftover `¶`.
- **Semantic search index reported nonsense for most translations.** Progress was measured against
  the KJV's verse count no matter which text you'd indexed, so the Masoretic Hebrew and Septuagint
  could never reach "done" and kept offering to rebuild. It also marched to 100% and stored nothing
  when the embedding model wasn't ready; it now says what went wrong.
- **Vocabulary reviews stopped disappearing.** Flashcards only looked at the 200 most frequent
  words, so any word you'd learned beyond that vanished from your review queue. Words you already
  know are no longer reshuffled in as new.
- **Drills no longer show the correct answer twice** when two words share a definition.
- **Searching now matches word beginnings**, so "love" finds "loved" and "loveth" (281 → 442 KJV
  verses).
- **Concordance highlighting** no longer breaks apart phrases containing a comma.
- **Original-language words written with look-alike Latin letters are findable again.** The
  Septuagint transcription substitutes Latin letters inside some Greek words ("Ισραὴλ") and carries
  printed-page section numbers; both made those words impossible to look up. The displayed text is
  untouched — only the search key is normalised.
- Clicking a word no longer flashes "No lexicon entry found" before the entry loads.
- A verse opened from search now scrolls into view in every parallel column, not just one.
- A deleted imported translation left in a side-by-side column no longer leaves a dead panel.
- Zooming the map with the scroll wheel no longer scrolls the page behind it.
- The notebook no longer risks overwriting itself when open in both the drawer and its own window.
- Asking the AI to edit a note can no longer interrupt an answer the assistant is still writing.

## [0.1.2] - 2026-08-10

### Added
- **Learn tab (Biblical Greek & Hebrew).** A new left-rail activity with four modules:
  - **Alphabet** — browsable Greek/Hebrew letter charts with a name/sound quiz.
  - **Vocabulary** — flashcards with **spaced repetition (SM-2)**, drawn from the most frequent
    words in the tagged Greek New Testament and Hebrew Old Testament.
  - **Drills** — multiple-choice "what does this word mean?" recognition practice.
  - **Grammar** — original, inductive "read real Greek/Hebrew early" courses (12 lessons each).
    Every lesson pairs a small grammar point with a **real verse rendered live from the tagged
    Scripture**, where you tap any word to reveal its transliteration, gloss, and parsing. The
    Greek course builds to reading John 3:16; the Hebrew course to the Shema and Genesis 1:1.
    Your review schedule and lesson progress are saved.
- **Cross-references.** A new **Cross-refs** study tab shows related passages for the selected
  verse, from the public-domain Treasury of Scripture Knowledge (~345,000 links).
- **Notebook.** Free-form Markdown notes saved to a local folder you choose. Notes are editable by
  hand and by the assistant — "Ask AI to edit" returns a proposal you explicitly **Apply** or
  **Insert**; the assistant never writes to your files on its own. It can also **pop out into its own
  movable window** so you can keep it beside the reader.
- **Reading history & bookmarks.** A top-bar menu remembers the chapters you've read and lets you
  save named bookmarks.
- **Export.** Save all your notes and highlights to a Markdown file.
- **Assistant awareness.** The study assistant now automatically knows the passage you have open
  (and any place or person you've selected), so you can ask about "this verse" or "here."
- **Map kingdoms overlay.** An optional, clearly-labeled *approximate* overlay of biblical empires
  (Egypt through Rome) that changes with a year slider.

### Changed
- **Editable assistant prompt.** The assistant's system prompt now lives in plain Markdown files
  under `src/main/ai/prompts/` — edit them (or drop a `system-prompt.md` in the app's data folder)
  to change how it behaves, with no code changes.
- **More accurate map.** The map projection is now latitude-corrected, so cities sit accurately on
  the coastlines instead of being stretched ~19% too wide.
- **Family view.** A person's verse references are now grouped by book, so long lists are easy to
  scan.
- **Regions and rivers on the map** (Galilee, the Jordan, the Euphrates…) are now shown as clearly
  *approximate* markers and hidden by default — a river or region isn't a single point. Cities and
  settlements still show as exact pins.
- **Study-panel tabs adapt to width** — when the panel is narrow, the longest tab labels collapse to
  their icon (with a tooltip) instead of wrapping.
- User data was migrated to a new schema version (adding bookmarks, history, spaced-repetition, and
  learning progress). Existing notes, highlights, and imported translations are preserved.

### Fixed
- Clicking a word in the reader now opens its lexicon **even when the Strong's numbers are hidden**
  (word-clicking was tied to number visibility).
- Cities are no longer hidden or dimmed by unreliable per-place dates — they always show at their
  exact coordinates.
- Removed a not-useful "filter by year" control from the Timeline (a timeline is already in order).
- The app icon is now used for the window, dock, and taskbar in development and on Linux (packaged
  installers were already correct).
- Added the missing attribution for the Natural Earth map basemap.

## [0.1.1] - 2026-08-09

_Summarized retroactively._ The first broadly feature-complete build: multi-translation reader
(KJV, BSB, WEB, YLT, Julia Smith) with parallel columns and search; original languages (interlinear
with selectable Masoretic, Septuagint, Textus Receptus, Byzantine, and Critical editions); study
tools (Strong's, multi-lexicon BDB/Abbott-Smith/LSJ, concordance, Quick Replace / Divine Names,
TR-vs-Critical apparatus, all-parses view); an opt-in, fully local AI assistant with grounded
Scripture Q&A and RAG; the Genealogies, Timelines, and Maps activities built on the Theographic
knowledge graph; import-your-own translation; and cross-platform installers via version-driven CI.

## [0.1.0] - 2026-08-09

_Summarized retroactively._ Initial release — the core offline reader, original-language tooling,
and the version-driven release pipeline.
