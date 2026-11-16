import type { DatabaseSync } from 'node:sqlite'
import { splitVerseUnits, unpackTags } from '../src/shared/verseUnits'
import sourceHashes from './assets/word-source-hashes.json'
import { BOOKS } from '../src/shared/books'
import { mapPassage } from '../src/shared/passageMapping'

export interface ReviewRow {
  chapter: number
  verse: number
  start: number
  end: number
  english: string
  strongs: string
  citation: string
  status: 'published' | 'corroborated' | 'rejected' | 'unresolved'
  reason?: string
  correspondences?: {
    edition: string
    revision: string
    book: string
    chapter: number
    verse: number
    row: string
    position: number | null
    citation: string
  }[]
  source?: {
    edition: string
    revision: string
    book: string
    chapter: number
    verse: number
    row: string
    position: number
    language: string
    form: string
    translit: string
    morph: string
    standalone: boolean
    uniqueForm: boolean
  }
}
type Segment = {
  start: number
  end: number
  strongs: string | null
  review?: ReviewRow
  inferred?: boolean
}
export function applyEvidence(db: DatabaseSync, id: string, book: string, reviews: ReviewRow[]) {
  const groups = new Map<string, ReviewRow[]>()
  for (const r of reviews) {
    const k = r.chapter + '.' + r.verse
    const group = groups.get(k) ?? []
    group.push(r)
    groups.set(k, group)
  }
  const verse = db.prepare(
    'SELECT text FROM verses WHERE translation_id=? AND book_id=? AND chapter=? AND verse=?'
  )
  const tags = db.prepare(
    'SELECT strongs FROM derived_tags WHERE translation_id=? AND book_id=? AND chapter=? AND verse=?'
  )
  const insert = db.prepare(
    'INSERT INTO verse_tokens (translation_id,book_id,chapter,verse,position,surface,trailer,strongs) VALUES(?,?,?,?,?,?,?,?)'
  )
  const evidence = db.prepare('INSERT INTO edition_token_evidence VALUES(?,?,?,?,?,?,?)')
  const occ = db.prepare('INSERT INTO edition_occurrences VALUES(' + Array(24).fill('?').join(',') + ')')
  const original = db.prepare(
    'SELECT * FROM original_tokens WHERE edition=? AND book_id=? AND chapter=? AND verse=? AND position=?'
  )
  const correspondenceTarget =
    db.prepare(`SELECT form,strongs,language FROM edition_occurrences WHERE source_edition=? AND source_revision=?
    AND source_book=? AND source_chapter=? AND source_verse=? AND source_row=? AND source_position IS ? AND translation_id=source_edition`)
  const addCorrespondence = db.prepare(
    'INSERT INTO edition_correspondences VALUES(' + Array(13).fill('?').join(',') + ')'
  )
  const fillVerifiedTag =
    db.prepare(`UPDATE verse_tokens SET strongs=? WHERE translation_id=? AND book_id=? AND chapter=?
    AND verse=? AND position=? AND strongs IS NULL`)
  const existingTokens = db.prepare(
    'SELECT position,surface,trailer,strongs FROM verse_tokens WHERE translation_id=? AND book_id=? AND chapter=? AND verse=? ORDER BY position'
  )
  const overlapping = db.prepare(
    'SELECT 1 FROM edition_occurrences WHERE translation_id=? AND book_id=? AND chapter=? AND verse=? AND start_position<=? AND end_position>=? LIMIT 1'
  )
  for (const group of groups.values()) {
    const { chapter, verse: v } = group[0]
    const loc = [id, book, chapter, v] as const
    const fail = (msg: string): never => {
      throw Error(loc.join(' ') + ' ' + msg)
    }
    const text = verse.get(...loc)?.text
    if (typeof text !== 'string') throw Error(loc.join(' ') + ' missing published verse')
    const active = group.filter((r) => r.status !== 'unresolved').sort((a, b) => a.start - b.start)
    if (!active.length) continue
    let lastEnd = 0
    for (const r of active) {
      if (
        !Number.isInteger(r.start) ||
        !Number.isInteger(r.end) ||
        r.end <= r.start ||
        r.start < lastEnd ||
        text.slice(r.start, r.end) !== r.english ||
        !r.citation ||
        !['published', 'corroborated', 'rejected'].includes(r.status) ||
        !/^[HG][1-9]\d*$/.test(r.strongs)
      )
        fail('invalid evidence range ' + JSON.stringify(r))
      lastEnd = r.end
    }
    function addOccurrence(r: ReviewRow, first: number, last: number) {
      const src = r.source
      if (!src) throw Error('Missing original occurrence ' + loc.join(' '))
      const canon = mapPassage({ book, chapter, verse: v }, id, 'KJV')
      const w = original.get(src.edition, src.book, src.chapter, src.verse, src.position)
      const index = BOOKS.findIndex((b) => b.id === src.book)
      const part =
        index < 5
          ? 'tahot_gen-deu.txt'
          : index < 17
            ? 'tahot_jos-est.txt'
            : index < 22
              ? 'tahot_job-sng.txt'
              : index < 39
                ? 'tahot_isa-mal.txt'
                : index < 43
                  ? 'tagnt_mat-jhn.txt'
                  : 'tagnt_act-rev.txt'
      const greek = src.language === 'Greek'
      const form =
        typeof w?.original === 'string'
          ? greek
            ? w.original.replace(/[.,;··:!?]+$/u, '')
            : w.original
          : null
      if (
        canon?.book !== src.book ||
        canon?.chapter !== src.chapter ||
        canon?.verse !== src.verse ||
        !w ||
        index < 0 ||
        src.revision !== sourceHashes[part] ||
        !src.row ||
        form?.normalize('NFC') !== src.form.normalize('NFC') ||
        w.strongs !== r.strongs ||
        w.morph !== src.morph ||
        w.translit !== src.translit ||
        greek !== index >= 39 ||
        greek !== r.strongs.startsWith('G') ||
        (greek
          ? !['NA', 'TR', 'BYZ'].includes(src.edition)
          : src.edition !== 'MT' ||
            !String(w.source_type).startsWith('L') ||
            !String(w.morph).startsWith(src.language === 'Aramaic' ? 'A' : 'H'))
      )
        fail('named source occurrence does not match ' + r.english)
      if (src.standalone && (first !== last || !/^\p{L}+$/u.test(r.english)))
        fail('standalone requires a single lexical word')
      occ.run(
        ...loc,
        first,
        last,
        r.english,
        src.edition,
        src.revision,
        src.book,
        src.chapter,
        src.verse,
        src.row,
        src.position,
        src.language,
        src.form,
        src.translit,
        r.strongs,
        src.morph,
        'corroborated',
        r.citation,
        Number(src.standalone),
        Number(src.uniqueForm),
        0
      )
      for (const link of r.correspondences ?? []) {
        const target = [
          link.edition,
          link.revision,
          link.book,
          link.chapter,
          link.verse,
          link.row,
          link.position
        ] as const
        const t = correspondenceTarget.get(...target)
        const mapped = mapPassage(
          { book: link.book, chapter: link.chapter, verse: link.verse },
          link.edition,
          'KJV'
        )
        if (
          !t ||
          !link.citation ||
          t.strongs !== r.strongs ||
          t.language !== src.language ||
          String(t.form).normalize('NFC').toLowerCase() !== src.form.normalize('NFC').toLowerCase() ||
          mapped?.book !== canon?.book ||
          mapped?.chapter !== canon?.chapter ||
          mapped?.verse !== canon?.verse
        )
          fail('unconfirmed correspondence ' + link.row)
        addCorrespondence.run(...loc, last, ...target, link.citation)
      }
    }
    const existing = existingTokens.all(...loc)
    if (existing.length) {
      const starts = new Map<number, number>(),
        ends = new Map<number, number>()
      let offset = 0
      for (const token of existing) {
        starts.set(offset, Number(token.position))
        offset += String(token.surface).length
        ends.set(offset, Number(token.position))
        offset += String(token.trailer).length
      }
      for (const r of active) {
        const first = starts.get(r.start),
          last = ends.get(r.end)
        if (first === undefined || last === undefined)
          throw Error(loc.join(' ') + ' disagrees with published token boundaries')
        if (
          r.status !== 'corroborated' ||
          (existing[last].strongs !== null && existing[last].strongs !== r.strongs) ||
          existing.slice(first, last).some((t) => t.strongs) ||
          overlapping.get(...loc, last, first)
        )
          fail('extra evidence overlaps a protected span or published tag at ' + r.english)
        addOccurrence(r, first, last)
        if (existing[last].strongs === null) {
          const update = fillVerifiedTag.run(r.strongs, ...loc, last)
          if (Number(update.changes) !== 1) fail('could not attach verified tag to the empty end token')
        }
        evidence.run(...loc, last, 'corroborated', r.citation)
      }
      continue
    }
    const segments: Segment[] = active.map((review) => ({
      start: review.start,
      end: review.end,
      strongs: review.status === 'rejected' ? null : review.strongs,
      review
    }))
    const units = splitVerseUnits(text)
    const packed = tags.get(...loc)?.strongs
    const inferred = typeof packed === 'string' ? unpackTags(packed) : []
    let offset = 0
    const derived: Segment[] = []
    for (let i = 0; i < units.length; i++) {
      const { surface, trailer } = units[i],
        end = offset + surface.length
      if (inferred[i]?.continues && derived.length) derived[derived.length - 1].end = end
      else
        derived.push({
          start: offset,
          end,
          strongs: inferred[i]?.strongs ?? null,
          inferred: !!inferred[i]?.strongs
        })
      offset = end + trailer.length
    }
    // A publisher span supersedes every intersecting inferred phrase. Never reuse a fraction of one.
    for (const s of derived) if (!segments.some((r) => r.start < s.end && r.end > s.start)) segments.push(s)
    segments.sort((a, b) => a.start - b.start)
    let position = 0,
      cursor = 0,
      rebuilt = ''
    function emit(surface: string, trailer: string, s?: Segment) {
      insert.run(...loc, position, surface, trailer, s?.strongs ?? null)
      const r = s?.review
      const kind = r
        ? r.status === 'rejected'
          ? 'unlinked'
          : r.status
        : s?.inferred
          ? 'inferred'
          : 'unlinked'
      evidence.run(...loc, position, kind, r?.citation ?? '')
      if (r?.status === 'corroborated') addOccurrence(r, position, position)
      rebuilt += surface + trailer
      position++
    }
    const literal = (start: number, end: number) => {
      if (start < end) emit(text.slice(start, end), '')
    }
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i]
      literal(cursor, s.start)
      const next = segments[i + 1]?.start ?? text.length
      const gap = text.slice(s.end, next)
      const trailer = gap.match(/^[^\p{L}\p{N}]*/u)?.[0] ?? ''
      emit(text.slice(s.start, s.end), trailer, s)
      cursor = s.end + trailer.length
    }
    literal(cursor, text.length)
    if (rebuilt !== text) fail('tokens differ from published verse')
  }
}
