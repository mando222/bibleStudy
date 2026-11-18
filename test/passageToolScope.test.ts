import { expect, it } from 'vitest'
import { passageToolColumns } from '../mobile/src/passageToolScope'

const base = { book: 'Phil', chapter: 1, activeVerse: 17, primary: 'BSB',
  referenceEdition: 'KJV', parallels: ['BSB', 'KJV'], interlinear: false }

it('starts with the focused parallel edition and keeps each edition’s own verse number', () => {
  expect(passageToolColumns(base, [])).toEqual([
    { translation: 'KJV', book: 'Phil', chapter: 1, verse: 17 },
    { translation: 'BSB', book: 'Phil', chapter: 1, verse: 16 }
  ])
})

it('preserves a visible verse zero and rejects stale chapter anchors', () => {
  const state = { ...base, book: 'Ps', chapter: 23, activeVerse: 1, primary: 'KJV', parallels: ['KJV'] }
  expect(passageToolColumns(state, [{ translation: 'KJV', book: 'Ps', chapter: 23, verse: 0 }])[0].verse).toBe(0)
  expect(passageToolColumns(state, [{ translation: 'KJV', book: 'Ps', chapter: 22, verse: 14 }])[0])
    .toEqual({ translation: 'KJV', book: 'Ps', chapter: 23, verse: 1 })
})

it('maps a shifted Psalm and keeps an unmapped imported edition confined to its own text', () => {
  expect(passageToolColumns({ ...base, book: 'Ps', chapter: 9, activeVerse: 22,
    primary: 'LXX', referenceEdition: 'LXX', parallels: ['LXX', 'BSB'] }, []))
    .toEqual([{ translation: 'LXX', book: 'Ps', chapter: 9, verse: 22 },
      { translation: 'BSB', book: 'Ps', chapter: 10, verse: 1 }])
  expect(passageToolColumns({ ...base, primary: 'imp_local', referenceEdition: 'imp_local',
    parallels: ['imp_local', 'KJV'] }, []))
    .toEqual([{ translation: 'imp_local', book: 'Phil', chapter: 1, verse: 17 }])
})

it('does not invent a verse before chapter data loads or a counterpart for an unmapped source', () => {
  expect(passageToolColumns({ ...base, activeVerse: null }, [])[0].verse).toBeUndefined()
  expect(passageToolColumns({ ...base, book: 'Ps', chapter: 151, activeVerse: 1,
    referenceEdition: 'LXX', interlinear: true }, [])).toEqual([])
})
