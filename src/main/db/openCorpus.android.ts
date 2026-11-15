import type { DatabaseSync } from 'node:sqlite'
import { corpusDb } from '../../../mobile/src/corpusDb'

// The shared query layer only reads through prepare(). The Android service owns the connection.
export function openCorpus(): DatabaseSync {
  return corpusDb as unknown as DatabaseSync
}
