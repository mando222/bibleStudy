import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, closeSync, fsyncSync, mkdirSync, openSync, readSync, renameSync, rmSync, writeSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

type Asset = { section: 'profile' | 'notebook'; name: string } & ({ source: string } | { text: string })
const profileFiles = new Set(['user.sqlite', 'ai.sqlite', 'reader-state.json', 'ai-config.json', 'updates.json', 'system-prompt.md'])

function checkAsset(section: string, name: string): void {
  if (section === 'profile' && profileFiles.has(name)) return
  if (section === 'notebook' && basename(name) === name && !/[\\/\x00]/.test(name) && !name.startsWith('.') && /\.md$/i.test(name)) return
  throw new Error('The backup contains an unsupported file name.')
}

/** One portable SQLite container. Stream large databases in bounded chunks. */
export function writeStudyArchive(destination: string, assets: Asset[]): void {
  const tmp = join(dirname(destination), `.backup-${randomUUID()}.tmp`)
  const db = new DatabaseSync(tmp)
  try {
    try {
      chmodSync(tmp, 0o600)
      db.exec(`CREATE TABLE manifest (version INTEGER NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE files (section TEXT NOT NULL, name TEXT NOT NULL, sha256 TEXT, PRIMARY KEY(section,name));
        CREATE TABLE parts (section TEXT NOT NULL, name TEXT NOT NULL, seq INTEGER NOT NULL, bytes BLOB NOT NULL,
          PRIMARY KEY(section,name,seq));
        BEGIN`)
      db.prepare('INSERT INTO manifest VALUES(1,?)').run(new Date().toISOString())
      const file = db.prepare('INSERT INTO files VALUES(?,?,NULL)')
      const put = db.prepare('INSERT INTO parts VALUES(?,?,?,?)')
      const finish = db.prepare('UPDATE files SET sha256=? WHERE section=? AND name=?')
      const buf = Buffer.alloc(1024 * 1024)
      for (const asset of assets) {
        checkAsset(asset.section, asset.name)
        file.run(asset.section, asset.name)
        const hash = createHash('sha256')
        let seq = 0
        const append = (bytes: Buffer) => {
          hash.update(bytes)
          put.run(asset.section, asset.name, seq++, bytes)
        }
        if ('source' in asset) {
          const fd = openSync(asset.source, 'r')
          try {
            let n: number
            while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) append(buf.subarray(0, n))
          } finally { closeSync(fd) }
        } else append(Buffer.from(asset.text))
        finish.run(hash.digest('hex'), asset.section, asset.name)
      }
      db.exec('COMMIT')
    } finally { db.close() }
    renameSync(tmp, destination)
  } finally { rmSync(tmp, { force: true }) }
}

/** Extract only into a newly created, inactive profile. Existing files are never targets. */
export function extractStudyArchive(path: string, target: string): void {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    db.exec('PRAGMA trusted_schema=OFF')
    const header = db.prepare('SELECT version FROM manifest').all()
    if (header.length !== 1 || header[0].version !== 1) throw new Error('Unsupported study backup version.')
    const files = db.prepare('SELECT section, name, sha256 FROM files').all()
    if (!files.some(f => f.section === 'profile' && f.name === 'user.sqlite')) throw new Error('Missing study database.')
    mkdirSync(join(target, 'Notebooks'), { recursive: true })
    const chunks = db.prepare('SELECT seq, bytes FROM parts WHERE section=? AND name=? ORDER BY seq')
    for (const file of files) {
      const { section, name, sha256 } = file
      if (typeof section !== 'string' || typeof name !== 'string') throw new Error('Invalid backup file.')
      checkAsset(section, name)
      const dest = join(section === 'notebook' ? join(target, 'Notebooks') : target, name)
      const fd = openSync(dest, 'wx', 0o600)
      try {
        const hash = createHash('sha256')
        let seq = 0
        for (const part of chunks.iterate(section, name)) {
          if (part.seq !== seq++ || !(part.bytes instanceof Uint8Array)) throw new Error('Invalid backup content.')
          hash.update(part.bytes)
          let offset = 0
          while (offset < part.bytes.length) offset += writeSync(fd, part.bytes, offset, part.bytes.length - offset)
        }
        if (hash.digest('hex') !== sha256) throw new Error(`Damaged backup file: ${name}`)
        fsyncSync(fd)
      } finally { closeSync(fd) }
    }
  } finally { db.close() }
}
