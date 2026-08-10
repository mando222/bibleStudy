import type { Letter } from './alphabet'

// The 22 letters of the Biblical Hebrew alphabet (read right-to-left). Final forms noted in the
// sound hint. Sound hints follow common teaching usage for Biblical Hebrew.
export const HEBREW_ALPHABET: Letter[] = [
  { upper: 'א', lower: 'א', name: 'alef', translit: 'ʾ', sound: 'silent / glottal stop', numeric: 1 },
  { upper: 'ב', lower: 'ב', name: 'bet', translit: 'b/v', sound: 'b as in boy (v without dagesh)', numeric: 2 },
  { upper: 'ג', lower: 'ג', name: 'gimel', translit: 'g', sound: 'g as in got', numeric: 3 },
  { upper: 'ד', lower: 'ד', name: 'dalet', translit: 'd', sound: 'd as in dog', numeric: 4 },
  { upper: 'ה', lower: 'ה', name: 'he', translit: 'h', sound: 'h as in hat', numeric: 5 },
  { upper: 'ו', lower: 'ו', name: 'vav', translit: 'w/v', sound: 'v (w in older usage)', numeric: 6 },
  { upper: 'ז', lower: 'ז', name: 'zayin', translit: 'z', sound: 'z as in zoo', numeric: 7 },
  { upper: 'ח', lower: 'ח', name: 'chet', translit: 'ḥ', sound: 'ch as in Bach (harsh h)', numeric: 8 },
  { upper: 'ט', lower: 'ט', name: 'tet', translit: 'ṭ', sound: 't as in top', numeric: 9 },
  { upper: 'י', lower: 'י', name: 'yod', translit: 'y', sound: 'y as in yes', numeric: 10 },
  { upper: 'כ', lower: 'כ/ך', name: 'kaf', translit: 'k/kh', sound: 'k (kh without dagesh; ך final)', numeric: 20 },
  { upper: 'ל', lower: 'ל', name: 'lamed', translit: 'l', sound: 'l as in law', numeric: 30 },
  { upper: 'מ', lower: 'מ/ם', name: 'mem', translit: 'm', sound: 'm as in mom (ם final)', numeric: 40 },
  { upper: 'נ', lower: 'נ/ן', name: 'nun', translit: 'n', sound: 'n as in now (ן final)', numeric: 50 },
  { upper: 'ס', lower: 'ס', name: 'samekh', translit: 's', sound: 's as in sit', numeric: 60 },
  { upper: 'ע', lower: 'ע', name: 'ayin', translit: 'ʿ', sound: 'silent / guttural', numeric: 70 },
  { upper: 'פ', lower: 'פ/ף', name: 'pe', translit: 'p/f', sound: 'p (f without dagesh; ף final)', numeric: 80 },
  { upper: 'צ', lower: 'צ/ץ', name: 'tsadi', translit: 'ṣ', sound: 'ts as in cats (ץ final)', numeric: 90 },
  { upper: 'ק', lower: 'ק', name: 'qof', translit: 'q', sound: 'k (further back)', numeric: 100 },
  { upper: 'ר', lower: 'ר', name: 'resh', translit: 'r', sound: 'r (rolled)', numeric: 200 },
  { upper: 'שׁ', lower: 'שׁ/שׂ', name: 'shin/sin', translit: 'sh/s', sound: 'sh (shin) or s (sin)', numeric: 300 },
  { upper: 'ת', lower: 'ת', name: 'tav', translit: 't', sound: 't as in top', numeric: 400 }
]
