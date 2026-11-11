/** Padded references like H0430 and H430 are the same numeric entry. */
export function lexiconId(input: string): string {
  const id = input.trim().toUpperCase()
  return id.replace(/^([GH])0+(\d+)$/, '$1$2')
}

export const isDivineNameId = (id: string): boolean => id === 'H3068' || id === 'H3069'

/** Restore selections store dictionary IDs only. A saved label or spelling cannot become reader text. */
export function normalizeSourceFormIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const id = lexiconId(item)
    if (/^[GH][1-9]\d*$/.test(id)) ids.add(id)
  }
  return [...ids]
}
