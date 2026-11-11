// Regenerate the offline form labels: node data-pipeline/build-morphology-labels.mjs
// STEPBible TEHMC / TEGMC, CC BY 4.0. Only exact, publisher-defined codes are used.
import { writeFile } from 'node:fs/promises'
const rev = 'f71b5e51f2d768ae72e3ed69743a7a9df25ef8b5'
const base = 'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/' + rev + '/Morphology%20codes/'
const labels = {}
for (const name of ['TEGMC - Translators Expansion of Greek Morphhology Codes', 'TEHMC - Translators Expansion of Hebrew Morphology Codes']) {
  const response = await fetch(base + encodeURIComponent(name + ' - STEPBible.org CC BY.txt'))
  if (!response.ok) throw Error(name + ': ' + response.status)
  for (const line of (await response.text()).split(/\r?\n/)) {
    const [code, ...columns] = line.split('\t')
    const fields = columns.find(col => col.startsWith('Function='))
    if (!code || !fields) continue
    // Parentheses headed "hence" are suggested interpretations, not part of the form code.
    const parts = fields.replace(/\s*\(hence [^)]*\)/gi, '').split(';').map(part => {
      const m = /^\s*([^=]+)=(.+?)\s*$/.exec(part)
      return m ? (m[1].trim() === 'Person' ? m[2] + ' person' : m[2]) : part.trim()
    }).filter(Boolean)
    if (Object.hasOwn(labels, code)) throw Error('Duplicate morphology ' + code)
    labels[code] = parts.join(' · ')
  }
}
if (Object.keys(labels).length !== 2566) throw Error('Unexpected morphology inventory')
await writeFile(new URL('../src/shared/frequencyMorphLabels.json', import.meta.url), JSON.stringify(labels, null, 1) + '\n')
