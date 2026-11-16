import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

const file = process.argv[2]
const expected = process.env.CORPUS_SHA256
if (!file || !/^[a-f0-9]{64}$/.test(expected ?? '')) throw new Error('Expected a database path and CORPUS_SHA256')
const hash = createHash('sha256')
for await (const chunk of createReadStream(file)) hash.update(chunk)
const actual = hash.digest('hex')
if (actual !== expected) throw new Error(`Database mismatch for ${file}: expected ${expected}, found ${actual}`)
console.log(`${actual}  ${file}`)
