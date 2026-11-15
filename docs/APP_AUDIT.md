# App reliability and polish review — 2026-09-25

Reviewed the Electron/React architecture, reader, search, annotations, notebook, imports,
interlinear, release checks, and dependency audit. This is a focused engineering review,
not an exhaustive certification of every feature or platform.

## Fixed in this working tree

| Area | Problem | Result |
| --- | --- | --- |
| Search | A slower earlier request could replace a later query or repopulate cleared results. Failures looked like an empty search. | Cancelled request results are ignored; clearing resets loading; errors have a retry action. The count identifies a truncated result list. |
| Reader navigation | A verse jump could be consumed using the previous chapter's data. The previous selected verse also remained in cross-reference/assistant context. | Chapter data is scoped to its request; jumps wait for the destination; chapter navigation clears verse context and verse links set it. Ordinary chapter changes return the reading pane to the top. |
| Annotations | Previous-chapter notes and highlights remained visible while the new chapter loaded. Open verse menus could outlive their passage. | Annotations are scoped to the displayed passage; navigation closes old menus and text-selection actions. |
| Cross-references | Late responses could show references for the wrong selected verse; loading and failures looked like no references. | Responses are scoped, with distinct loading/error states and retry. |
| Interlinear | Verse links did not scroll. Reordered English phrases could be stacked under the wrong original occurrence. | Verse links scroll to their destination. The stack verifies word forms against publisher occurrences and shows the complete verse for partial or unavailable links. |
| Notebook switching | Switching before the 600 ms autosave timer fired discarded the latest edits; late reads could fill the wrong editor. | File changes wait for saves; stale reads are ignored; writes are serialized. Failed writes keep the draft visible and block the file change. |
| Notebook creation | “New” used the ordinary overwrite API, so an existing name erased that note. | Creation uses a separate IPC method and exclusive file creation. Duplicate names produce an error. |
| Notebook feedback | “Saved” remained visible during later unsaved edits; write failures were hidden. | Loading, unsaved, saving, saved, and error states are explicit. Closing with a pending write waits for completion, with failure keeping the window open. |
| Accessibility / preview | Off-screen assistant and notebook controls remained keyboard-accessible. Browser preview had no notebook API. | Closed drawers are inert and hidden from assistive technology; preview has an isolated in-memory notebook. |

New DOM-level regression tests exercise asynchronous ordering, navigation, translation alignment,
save failures, and window-close flushing. A filesystem test proves duplicate note creation preserves
the original content. `jsdom` is a development-only dependency; no runtime service was added.

### Validation

- `npm run typecheck`: both main/preload and renderer checks passed.
- `npm test`: 131 tests passed across 14 files, including all 33 existing database-integrity checks.
- `npm run build`: production compilation passed. The pre-existing mixed static/dynamic import
  warning for AI vectors remains.
- Built Electron `--smoke-test`: all 20 checks passed using a disposable temporary user profile.
- Browser preview: visually inspected the interlinear layout and notebook editor; verified note
  creation, save feedback, and duplicate-name rejection with preserved text.

The browser preview uses fixture data. No Android build, cross-platform installer rebuild, full
data-pipeline rebuild, or physical-device test was performed in this pass.

## Next priorities

These findings remain open. Items described as code findings have not all been reproduced in a
packaged app.

1. **Import transactions and translation selection — high priority.**
   In `src/main/db/user.ts`, `importFromSqlite` writes metadata before `BEGIN` and has no rollback
   on an insertion failure. A malformed module can leave a partial import/open transaction.
   Validate input and insert metadata/verses in one transaction with rollback. Test a failure
   midway through import, followed by an ordinary note write. Removing an active imported version
   in `AboutModal.tsx` also needs to repair reader selections immediately; today's repair only
   runs at app startup.
2. **Search coverage — high priority for study accuracy.**
   `src/main/ipc.ts` sends every search to the bundled DB; imported verses live in `user.sqlite`,
   so imported-translation text searches are not covered. In `src/main/db/bible.ts`, Strong's
   searches omit the selected translation/testament/book when calling the concordance; Greek
   text searches select only the LXX, leaving the Greek NT out. Define consistent scope semantics,
   implement them in the data layer, and add database-backed search tests. Add pagination beyond
   the existing first 150 results.
3. **Notebook conflict detection and recovery — high priority for personal data.**
   The drawer and detached window still have independent in-memory drafts of the same file.
   Prevent a stale editor from overwriting another window's changes using an expected revision
   check in the main process. Add conflict/merge recovery, atomic replacement for ordinary saves,
   and recoverable deletion. The fixes above address switching and write ordering within one editor.
4. **Dependency maintenance — high priority before the next release.**
   `npm audit` on this lockfile reports 20 affected packages: 2 critical, 14 high, 4 moderate.
   These are dependency advisory severities, not proof of exploitable paths in the shipped app.
   Critical entries include the older Vitest server and transitive `tar`; the dependency chain
   includes Vite/electron-vite and electron-builder. Plan coordinated tooling upgrades and test
   installers on all supported OSes. Do not use a blind `npm audit fix --force` on the release toolchain.
5. **Backup and restore — high value, especially before Android.**
   The Markdown export covers notes/highlights but cannot restore the complete user database.
   Add a versioned export/import covering bookmarks, notes, highlights, learning progress, and
   notebook files. Include round-trip and migration tests.
6. **Accessibility and smaller screens — next polish pass.**
   The three-pane layout and fixed desktop toolbar need a phone-specific arrangement. Add modal
   focus management, keyboard access to verse actions, Escape behavior, consistent input labels,
   reader font-size controls, and measured contrast checks. The existing 960 px Electron minimum
   window width is not a mobile layout.
7. **Keep planning docs aligned with the implementation.**
   Older roadmap sections still list shipped work such as runtime icons, cross-references, ASV,
   Geneva, and persisted chat as deferred/backlog. Reconcile those sections before estimating new
   content work. Commentaries, a full dictionary browser, and deeper word studies remain useful
   feature candidates after reliability work.

## Android without AI

**Feasible; recommended direction: reuse the React UI and shared TypeScript in a Capacitor
Android shell.** Capacitor explicitly supports adding its native runtime to an existing web app.
This assessment follows the [Capacitor integration documentation](https://capacitorjs.com/docs/getting-started)
and the repository's current separation of renderer, preload, main process, and shared types.

| Existing part | Android approach |
| --- | --- |
| React components, shared types, book/reference helpers, study algorithms | Reuse, with a touch-oriented reading layout. |
| `BibleApi` contract in `src/shared/types.ts` | Retain as the service boundary; provide desktop and Android implementations. |
| Electron preload + IPC; Node `DatabaseSync` | Replace with native asynchronous SQLite calls. Extract portable query/mapping logic from the Node-bound modules. |
| Read-only Bible DB + writable user DB | Preserve this separation on Android; copy bundled content to an appropriate app location and migrate user data independently. |
| Desktop dialogs, file paths, detached notebook window, update installers | Use Android document/share flows, app-private note storage, and platform navigation/update distribution. |
| Assistant, model setup, document RAG and vector indexing | Exclude from the Android entry point and dependency graph. Remove assistant buttons, selection actions, notebook AI controls, and model downloads for that build. |

The [community SQLite plugin](https://github.com/capacitor-community/sqlite) is a candidate adapter,
not a validated choice yet. First prove the actual prebuilt database opens and its FTS5 queries,
Unicode handling, migrations, and read-only access work on supported Android devices. The local
`resources/bible.sqlite` currently occupies about **384 MiB**; measure compressed APK/AAB size and
first-run disk needs before deciding whether to ship everything or offer smaller offline editions.
Do not introduce a network requirement for reading after installation.

Suggested delivery sequence:

1. Build an Android proof of concept: one bundled translation, book/chapter navigation, full-text
   search, and notes/highlights that survive restart, all in airplane mode.
2. Adapt navigation for phones: one reading pane, bottom navigation, study details as a sheet,
   accessible touch targets, Hebrew RTL, larger text, Android Back, and keyboard/inset handling.
3. Port interlinear, lexicons, cross-references, bookmarks, and learning data through the shared
   API; add backup/import. Then evaluate maps, timelines, and translation-module imports.
4. Validate on a physical mid-range phone plus an emulator; produce a signed installable Android
   build using the [Android toolchain](https://capacitorjs.com/docs/android).

This review does **not** create an Android project or APK. Removing AI alone does not make the
Electron database and filesystem code run on Android.

### Android feasibility update · 2026-11-12

**Proposed first deliverable.** An installable Android test app with BSB and KJV, book and chapter navigation,
offline search, notes, highlights, and a word-study sheet. Bundle the existing study database for the trial.
A phone shows one translation at a time. Tapping a word opens its entry, and a restored word offers
**Compare translations**. Android Back returns to the same verse and scroll position. Long-press selects
the published text for copying or sharing.

**Shared code and native work.** Use a Capacitor entry point that installs the Android implementation of
the study API before the React reader starts. Reuse verse numbering, restoration, copy rules and edition
preferences from the current working tree. Supply chapter and verse results through native SQLite calls,
with separate databases for the read-only library and writable study data. Keep BSB publisher rows and
the evidence for KJV links together. The Android build should omit the assistant, notebook AI edits,
model downloads, document indexing, vectors and AI backup data. Ordinary Scripture search uses SQLite
full-text search. [Capacitor Android](https://capacitorjs.com/docs/android)

**Offline delivery.** The current database measures 530.26 MiB on disk and 149.12 MiB with Deflate level 6.
Those figures cover the database alone. Shipping the compressed file and extracting a private copy would
use about 679 MiB before app code and user data. Test a fresh install and an update with limited free
space, including the temporary space required to replace the database safely. Measure the device-specific
download from a built app bundle before deciding whether separate content packs are worthwhile.
[Android bundletool](https://developer.android.com/tools/bundletool#measure_size)

**First device checks.** Android Studio and SDKs are installed on the development Mac. The ARM64 library
in AndroidX’s bundled SQLite 2.7.1 contains the FTS5 compile option. The proposed native bridge still
needs an emulator and physical-phone test with the actual database. [AndroidX SQLite](https://developer.android.com/jetpack/androidx/releases/sqlite)

- Open the installed app for the first time in airplane mode. The BSB exact search `"shepherd"` should
  return 62 verse hits. The default prefix search also finds forms such as *shepherds* and returns 114.
  Verify accented Greek and pointed Hebrew lookup as well.
- In BSB Genesis 4:16, display “of YHWH” and copy “of the LORD.” In BSB 1 John 2:1, show both verified
  Greek forms beside their respective English phrases, preserving “not.” The KJV column keeps its printed
  wording at those occurrences. Check the same actions with TalkBack and enlarged text.
- Save a note, highlight and preferred text order, force-stop, then reopen offline. Test an app update
  against that profile. For a subsequent interlinear build, verify that BSB Psalm 51:1 opens Swete 50:3.

After this trial, the proposed next features are the interlinear, variants, full Words directory and
frequency maps. Atlas, person maps, timelines and desktop study-backup transfer can follow. Desktop
backup bundles can include optional assistant data, so exchanging study work needs an explicit
Android import and export path. This assessment covers the current repository and local measurements.

**Android 0.1.0 test build.** The APK now packages the full database and runs without the internet
permission. On an Android 16 ARM64 emulator it opened for the first time in airplane mode, searched
both scripts, and kept the two G264 occurrences distinct. The native long-press Copy and Share
actions both supplied “of the LORD” when the displayed “YHWH” was selected in BSB Genesis 4:16.
Notes, highlights, the reading location and the preferred text order survived reinstalling the APK in place.
The emulator also preserved a prior database and verse notes when a replacement would not fit into
400 MiB of free space. Retry completed after space was freed. Physical-device performance and
distribution through Google Play are still untested. [Build and install the test app](ANDROID.md)

**Android 0.2.0 device checks.** The Samsung SM-S936U running Android 17 accepted an in-place
upgrade from 0.1.0. Its reader opened Genesis 1, offered all 11 translation choices, and loaded
the 1,274-place atlas. Native checks verified the two Greek forms in 1 John 2:1, the five forms
counted for G26 in the critical text, and the mapping from BSB Psalm 51:1 to Swete 50:3.

On Android 16 the offline reader displayed “of YHWH” in BSB Genesis 4:16 and returned
“of the LORD” for the selected text. An in-place upgrade reopened BSB Philippians 1:16 at the
saved text size. A follow-up study check opened Nod without a pin, inspected Paul's ordered
stops in Acts 13, and followed a “good shepherd” search result to John 10:11. Transfers through
Android’s document picker included an imported Bible, a Markdown notebook and a study backup.
A damaged backup was rejected before switching profiles. [Android study and testing guide](ANDROID.md)
