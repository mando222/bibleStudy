import { app } from 'electron'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import identity from './prompts/identity.md?raw'
import grounded from './prompts/grounded.md?raw'
import general from './prompts/general.md?raw'

/**
 * The assistant's system prompt, assembled from the editable Markdown files in ./prompts.
 * Edit those files (and rebuild) to change the assistant's behaviour — see prompts/README.md.
 * The reader's current context and retrieved passages are injected separately into the user turn
 * (see assistant.ts), so the system prompt stays stable and easy to edit.
 */

/** A `<userData>/system-prompt.md`, if present, overrides the whole prompt (no rebuild needed). */
function overridePrompt(): string | null {
  try {
    const p = join(app.getPath('userData'), 'system-prompt.md')
    if (existsSync(p)) return readFileSync(p, 'utf8').trim() || null
  } catch {
    /* app not ready or file unreadable — fall back to the bundled prompt */
  }
  return null
}

export function buildSystemPrompt(opts: { grounded: boolean }): string {
  const override = overridePrompt()
  if (override) return override
  return `${identity.trim()} ${(opts.grounded ? grounded : general).trim()}`
}
