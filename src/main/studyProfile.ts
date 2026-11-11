import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWrite } from './notebookFiles'

let current: { id: string; root: string } | undefined

/** Keep open connections on one profile until the next launch. Older installs use userData directly. */
export function studyProfile(): { id: string; root: string } {
  if (current) return current
  const home = app.getPath('userData')
  const pointer = join(home, 'active-study-profile')
  if (!existsSync(pointer)) return current = { id: '', root: home }
  const id = readFileSync(pointer, 'utf8').trim()
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid saved study profile.')
  const root = join(home, 'study-profiles', id)
  if (!existsSync(join(root, 'user.sqlite'))) throw new Error('The selected study profile is missing.')
  return current = { id, root }
}

export function activateProfile(id: string): void {
  atomicWrite(join(app.getPath('userData'), 'active-study-profile'), id)
}
