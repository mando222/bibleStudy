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
| Interlinear | Verse links did not scroll. Inferred translation alignments were returned by the backend but excluded by the UI's scholarly-tag metadata filter. | Verse links scroll and flash their destination; inferred aligned rows appear. Controls wrap within the reading pane. |
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
