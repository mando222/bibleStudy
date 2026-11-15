// Theographic IDs keep namesakes distinct. Each citation identifies a mother and
// the specified children, or names her in the immediately preceding verse.
interface MotherEvidence {
  mother: number
  children: number[]
  refs: string[]
}
const mothers: MotherEvidence[] = [
  { mother: 1348, children: [630], refs: ['Gen.16.15'] }, // Hagar
  { mother: 2473, children: [616], refs: ['Gen.21.3'] }, // Sarah
  { mother: 1782, children: [3086, 1685, 1978, 2075, 620, 2727], refs: ['Gen.25.1', 'Gen.25.2'] }, // Keturah
  { mother: 1813, children: [2429, 2741, 1820, 1751, 645, 3002], refs: ['Gen.35.23'] }, // Leah
  { mother: 1813, children: [1012], refs: ['Gen.30.21'] }, // Dinah
  { mother: 2386, children: [1710, 463], refs: ['Gen.35.24'] }, // Rachel
  { mother: 502, children: [973, 2149], refs: ['Gen.35.25'] }, // Bilhah
  { mother: 3081, children: [1262, 337], refs: ['Gen.35.26'] }, // Zilpah
  { mother: 153, children: [232], refs: ['1Chr.3.1'] }, // Ahinoam
  { mother: 26, children: [939], refs: ['1Chr.3.1'] }, // Abigail
  { mother: 1839, children: [59], refs: ['1Chr.3.2'] }, // Maacah
  { mother: 1353, children: [97], refs: ['1Chr.3.2'] }, // Haggith
  { mother: 54, children: [2657], refs: ['1Chr.3.3'] }, // Abital
  { mother: 1036, children: [655], refs: ['1Chr.3.3'] }, // Eglah
  { mother: 416, children: [2547, 2715, 2152, 2762], refs: ['1Chr.3.5'] }, // Bathsheba
  { mother: 1400, children: [2469], refs: ['1Sam.1.20'] }, // Hannah
  { mother: 1938, children: [905], refs: ['Matt.1.16'] } // Mary
]

export function motherRefs(motherId: number | null, childId: number): string[] {
  return mothers.find(group => group.mother === motherId && group.children.includes(childId))?.refs ?? []
}

// Each pair occurs within a single family. The catalog attaches both Azariahs to
// the same verse without identifying a particular mention for either record.
export function familyName(person: { id: number; name: string }): string {
  switch (person.id) {
    case 2345: return 'Philip (husband of Herodias)' // Matt 14:3
    case 2346: return 'Philip (tetrarch of Ituraea)' // Luke 3:1
    case 381:
    case 382: return `Azariah (catalog ${person.id})` // 2 Chr 21:2
    default: return person.name
  }
}
