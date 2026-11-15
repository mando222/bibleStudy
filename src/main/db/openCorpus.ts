import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

function resolveDbPath(): string | null {
  // app.getAppPath() is the app root when launched as `electron .`, but the SCRIPT'S directory when
  // launched as `electron out/main/index.js` — which is how the smoke test used to miss the DB and
  // report 16 phantom failures. Walking up from __dirname (out/main → repo root) and the cwd covers
  // both, on top of the packaged extraResources location.
  const candidates = [
    join(process.resourcesPath ?? '', 'bible.sqlite'),
    join(app.getAppPath(), 'resources', 'bible.sqlite'),
    join(app.getAppPath(), '..', 'resources', 'bible.sqlite'),
    join(__dirname, '..', '..', 'resources', 'bible.sqlite'),
    join(process.cwd(), 'resources', 'bible.sqlite')
  ]
  return candidates.find((p) => p && existsSync(p)) ?? null
}

export function openCorpus(): DatabaseSync | null {
  const path = resolveDbPath()
  if (!path) return null
  const db = new DatabaseSync(path, { readOnly: true })
  db.exec('PRAGMA foreign_keys = OFF;')
  return db
}
