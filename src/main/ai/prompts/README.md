# Assistant system prompt

The assistant's system prompt is assembled from the plain-text Markdown files in this folder.
**Edit these files to change how the assistant behaves, then rebuild the app** (`npm run build` /
a release). No code changes are needed.

- `identity.md` — who the assistant is and always-on rules (shared by both modes). Loaded first.
- `grounded.md` — extra rules for **Grounded mode** (the default: answer only from retrieved
  Scripture/documents). Appended after `identity.md`.
- `general.md` — extra rules for **General mode** (the "Ground answers in Scripture" toggle is
  off: answer from the model's own knowledge). Appended after `identity.md`.

The final system prompt is `identity.md` + (the active mode's file). These files are loaded
verbatim, so **do not add comments or notes inside them** — anything you write becomes part of the
prompt sent to the model. Keep guidance here in `README.md` instead (this file is *not* loaded).

## Editing without a rebuild (optional)

If a file named `system-prompt.md` exists in the app's user-data folder, its contents **replace the
entire system prompt** for both modes (the reader's current context is still appended). This lets
you experiment without rebuilding. Delete the file to return to the bundled prompt above.

User-data folder:

- macOS: `~/Library/Application Support/open-bible-study/system-prompt.md`
- Windows: `%APPDATA%/open-bible-study/system-prompt.md`
- Linux: `~/.config/open-bible-study/system-prompt.md`
