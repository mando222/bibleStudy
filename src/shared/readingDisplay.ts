export const readingFeatures = {
  literary: 'Literary layout',
  speakers: 'Speaker guides',
  structured: 'Structured passages',
  headings: 'Publisher headings',
  chapterNumbers: 'Chapter numbers',
  verseNumbers: 'Verse numbers'
} as const

export type ReadingFeature = keyof typeof readingFeatures
export type DisplayFlags = Record<ReadingFeature, boolean>
export type DisplayOverrides = Record<string, Partial<DisplayFlags>>
export const plainDisplay: DisplayFlags = {
  literary: false, speakers: false, structured: false,
  headings: false, chapterNumbers: true, verseNumbers: true
}

/** Picking an open edition trades the two columns' positions without closing either translation. */
export function chooseColumn(editions: string[], index: number, edition: string): string[] {
  const next = editions.slice()
  const previous = next.indexOf(edition)
  if (previous !== -1) next[previous] = editions[index]
  next[index] = edition
  return next
}

export function editionDisplay(defaults: DisplayFlags, overrides: DisplayOverrides, edition: string): DisplayFlags {
  return { ...defaults, ...overrides[edition] }
}

export function overrideDisplay(overrides: DisplayOverrides, edition: string, feature: ReadingFeature, value: boolean | null): DisplayOverrides {
  const next = { ...overrides }
  const flags = { ...next[edition] }
  if (value === null) delete flags[feature]
  else flags[feature] = value
  if (Object.keys(flags).length) next[edition] = flags
  else delete next[edition]
  return next
}
