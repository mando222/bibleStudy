import labels from './frequencyMorphLabels.json'

/** Expand only documented codes; an unknown code remains available for inspection. */
export function describeFrequencyMorph(code: string): string {
  const entries: Record<string, string> = labels
  if (!code) return 'Grammar not recorded'
  if (Object.prototype.hasOwnProperty.call(entries, code)) return entries[code]
  // TAHOT writes the H/A prefix only once in a compound morphology analysis.
  if (/^[HA][A-Za-z\d]+(?:\/[A-Za-z\d]+)+$/.test(code)) {
    return code.split('/').map((part, i) => entries[i ? code[0] + part : part] || part).join(' + ')
  }
  return code
}
