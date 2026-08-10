import { resolve, basename, sep } from 'node:path'

/**
 * Resolve a user-supplied note name to a safe `.md` path inside `baseDir`, or throw. Pure — no I/O,
 * no Electron — so it is unit-testable. `basename` strips any directory components (blocking `..`
 * and absolute paths), a `.md` extension is enforced, dotfiles are rejected, and the result is
 * verified to sit directly inside `baseDir`.
 */
export function safeNotePath(baseDir: string, name: string): string {
  const clean = basename(name) // strip directory components → no traversal
  if (!clean || clean === '.' || clean === '..' || clean.startsWith('.')) {
    throw new Error('Invalid file name')
  }
  const withExt = /\.md$/i.test(clean) ? clean : `${clean}.md`
  const base = resolve(baseDir)
  const full = resolve(base, withExt)
  if (full !== base + sep + basename(full) || !full.startsWith(base + sep)) {
    throw new Error('Invalid path')
  }
  return full
}
