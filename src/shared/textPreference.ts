export type NtText = 'NA' | 'TR' | 'BYZ'
export type OtText = 'MT' | 'LXX'
export type MasoreticReading = 'qere' | 'ketiv'

export interface TextPreference {
  nt: NtText[]
  ot: OtText[]
  masoretic: MasoreticReading[]
}

export const defaultTextPreference: TextPreference = {
  nt: ['NA', 'TR', 'BYZ'],
  ot: ['MT', 'LXX'],
  masoretic: ['qere', 'ketiv']
}

export const textEditionLabels: Record<NtText | OtText | MasoreticReading, string> = {
  NA: 'Critical text (NA28 readings)',
  TR: 'Textus Receptus (Scrivener 1894)',
  BYZ: 'Byzantine text (Robinson–Pierpont 2005)',
  MT: 'Masoretic Text (Hebrew and Aramaic)',
  LXX: 'Septuagint (Greek translation, Swete edition)',
  qere: 'Qere (read)',
  ketiv: 'Ketiv (written)'
}

function completeOrder<T extends string>(value: unknown, defaults: T[]): T[] {
  const order = new Set<T>()
  if (Array.isArray(value)) {
    for (const id of value) if (defaults.includes(id)) order.add(id)
  }
  for (const id of defaults) order.add(id)
  return [...order]
}

/** Retain supported choices from old preferences and append any missing editions in default order. */
export function normalizeTextPreference(value: unknown): TextPreference {
  const saved = (value ?? {}) as Partial<TextPreference>
  return {
    nt: completeOrder(saved.nt, defaultTextPreference.nt),
    ot: completeOrder(saved.ot, defaultTextPreference.ot),
    masoretic: completeOrder(saved.masoretic, defaultTextPreference.masoretic)
  }
}
