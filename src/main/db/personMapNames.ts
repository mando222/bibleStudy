export interface MapName {
  id: number
  name: string
  gender: string | null
  parentName: string | null
  hasNamesake: number
}

// Atlas search aliases identify specific people in the cited passages. Theographic
// parent links distinguish the remaining people who share a name. Translation text
// is always read from the selected edition.
const names: Record<number, { displayName?: string; aliases?: string[] }> = {
  58: { aliases: ['Abram'] }, // Gen 17:5
  682: { displayName: 'Jacob (Israel)', aliases: ['Jacob'] }, // Gen 35:10
  905: { displayName: 'Jesus Christ', aliases: ['Jesus of Nazareth'] }, // Matt 1:16, Acts 2:22
  939: { aliases: ['Chileab'] }, // 1 Chr 3:1, 2 Sam 3:3
  1078: { aliases: ['Beeliada'] }, // 1 Chr 3:8, 14:7
  1143: { displayName: 'Eliphalet (1 Chronicles 3:8)', aliases: ['Eliphelet'] },
  1148: { displayName: 'Elpalet (1 Chronicles 3:6)', aliases: ['Eliphelet', 'Elpelet'] }, // 1 Chr 14:5
  1163: { displayName: 'Elishua (1 Chronicles 3:6)', aliases: ['Elishama'] }, // 1 Chr 14:5
  1407: { displayName: 'Haran (brother of Abraham)' }, // Gen 11:26–28
  1679: { displayName: 'John Mark', aliases: ['Mark'] }, // Acts 12:12
  1710: { displayName: 'Joseph (son of Jacob)', aliases: ['Zaphnath-paaneah'] }, // Gen 37:2–3, 41:45
  1722: { aliases: ['Joses', 'Joseph'] }, // Acts 4:36
  1727: { aliases: ['Hoshea', 'Oshea', 'Jehoshua'] }, // Num 13:16
  2147: { aliases: ['Mara'] }, // Ruth 1:20
  2370: { aliases: ['Prisca'] }, // Rom 16:3, 2 Tim 4:19
  2473: { aliases: ['Sarai'] }, // Gen 17:15
  2478: { displayName: 'Saul (son of Kish)' }, // 1 Sam 9:1–2
  2479: { displayName: 'Paul (Saul of Tarsus)', aliases: ['Saul', 'Saul of Tarsus'] }, // Acts 9:11, 13:9
  2547: { aliases: ['Shimea'] }, // 1 Chr 3:5, 14:4
  2762: { aliases: ['Jedidiah'] } // 2 Sam 12:24–25
}

export function atlasIdentity(row: MapName) {
  const known = names[row.id]
  let displayName = known?.displayName ?? row.name
  if (!known?.displayName && row.hasNamesake && row.parentName) {
    const kinship = row.gender === 'Female' ? 'daughter' : row.gender === 'Male' ? 'son' : 'child'
    displayName = `${row.name} (${kinship} of ${row.parentName})`
  }
  return { id: row.id, name: row.name, displayName, aliases: known?.aliases ?? [] }
}
