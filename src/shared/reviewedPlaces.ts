import type { PersonMapStop } from './passageStudy'

interface Association {
  people: number[]
  placeId: number
  role: PersonMapStop['role']
  label: string
  refs: string[]
  journey?: string
  order?: number
}

// IDs identify specific Theographic people and places. Each association is checked
// against the cited biblical text. An event's locations are not an itinerary.
const paul = 'Through Pisidia · Acts 13'
const ruth = 'From Moab to Bethlehem · Ruth 1'
export const reviewedAssociations: Association[] = [
  { people: [2479], placeId: 919, role: 'departure', label: 'Departure from Paphos', refs: ['Acts.13.13'], journey: paul, order: 1 },
  { people: [2479], placeId: 936, role: 'visit', label: 'Arrival at Perga', refs: ['Acts.13.13', 'Acts.13.14'], journey: paul, order: 2 },
  { people: [2479], placeId: 69, role: 'visit', label: 'Arrival at Pisidian Antioch', refs: ['Acts.13.14'], journey: paul, order: 3 },
  { people: [1679], placeId: 636, role: 'visit', label: 'John returns to Jerusalem', refs: ['Acts.13.13', 'Acts.12.25'] },
  { people: [2450, 2147], placeId: 815, role: 'departure', label: 'Departure from the region of Moab', refs: ['Ruth.1.7', 'Ruth.1.22'], journey: ruth, order: 1 },
  { people: [2450, 2147], placeId: 218, role: 'visit', label: 'Arrival at Bethlehem in Judah', refs: ['Ruth.1.19', 'Ruth.1.22', 'Ruth.1.1'], journey: ruth, order: 2 },
  { people: [2479], placeId: 1140, role: 'birthplace', label: 'Born in Tarsus', refs: ['Acts.21.40', 'Acts.22.3'] },
  { people: [905], placeId: 218, role: 'birthplace', label: 'Born in Bethlehem in Judah', refs: ['Matt.2.1'] },
  { people: [905], placeId: 878, role: 'residence', label: 'Brought up in Nazareth', refs: ['Luke.4.16'] },
  { people: [1], placeId: 842, role: 'death', label: 'Died on Mount Hor', refs: ['Num.33.38', 'Num.33.39'] },
  { people: [2108], placeId: 815, role: 'death', label: 'Died in the land of Moab', refs: ['Deut.34.5'] },
  { people: [2473], placeId: 551, role: 'death', label: 'Died at Hebron', refs: ['Gen.23.2'] },
  { people: [2469], placeId: 975, role: 'residence', label: 'Home at Ramah', refs: ['1Sam.7.15', '1Sam.7.17'] },
  { people: [2841], placeId: 527, role: 'death', label: 'Died at Haran', refs: ['Gen.11.32'] },
  { people: [58, 2473, 1830, 2841], placeId: 527, role: 'residence', label: 'Settled in Haran', refs: ['Gen.11.31'] },
  { people: [58, 2473, 1830], placeId: 272, role: 'visit', label: 'Entered Canaan', refs: ['Gen.12.4', 'Gen.12.5'] },
  { people: [1710], placeId: 362, role: 'residence', label: 'Lived in Egypt', refs: ['Gen.50.22'] },
  { people: [2478], placeId: 837, role: 'death', label: 'Died on Mount Gilboa', refs: ['1Sam.31.1', '1Sam.31.4', '1Sam.31.8'] },
  { people: [279], placeId: 956, role: 'birthplace', label: 'Born in Pontus', refs: ['Acts.18.2'] },
  { people: [279, 2370], placeId: 306, role: 'residence', label: 'Lived in Corinth', refs: ['Acts.18.1', 'Acts.18.2', 'Acts.18.3'] },
  { people: [1407], placeId: 1189, role: 'death', label: 'Died in Ur of the Chaldees', refs: ['Gen.11.27', 'Gen.11.28'] },
  { people: [232, 939], placeId: 551, role: 'birthplace', label: 'Born in Hebron', refs: ['1Chr.3.1', '1Chr.3.4'] },
  { people: [59, 97], placeId: 551, role: 'birthplace', label: 'Born in Hebron', refs: ['1Chr.3.2', '1Chr.3.4'] },
  { people: [2657, 655], placeId: 551, role: 'birthplace', label: 'Born in Hebron', refs: ['1Chr.3.3', '1Chr.3.4'] },
  { people: [2715, 2152, 2762], placeId: 636, role: 'birthplace', label: 'Born in Jerusalem', refs: ['1Chr.3.5'] }
]

/** Only passages whose cited narrative explicitly takes place at the listed site.
 * Other geographic links retain the more general “mentioned” description. */
export const reviewedSettings: Record<string, readonly number[]> = {
  'Acts.13.13': [936], 'Acts.13.14': [69], 'Acts.15.4': [636],
  'Ruth.1.19': [218], 'Ruth.1.22': [218], 'Gen.23.2': [551],
  'Num.33.38': [842], 'Num.33.39': [842], 'Deut.34.5': [815]
}

export function stopsForPerson(id: number): PersonMapStop[] {
  return reviewedAssociations.filter(a => a.people.includes(id)).map(a => ({
    placeId: a.placeId, role: a.role, label: a.label, refs: a.refs,
    journey: a.journey ?? null, order: a.order ?? null, source: 'Open Bible Study · reviewed passage notes'
  }))
}
