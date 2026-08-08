// Canonical 66-book Protestant order. `id` is our stable key (OSIS-style),
// `usfm` is the 3-letter Paratext code many source datasets use (for pipeline mapping).
export type Testament = 'OT' | 'NT'

export interface BookMeta {
  id: string
  usfm: string
  name: string
  testament: Testament
  chapters: number
}

export const BOOKS: BookMeta[] = [
  { id: 'Gen', usfm: 'GEN', name: 'Genesis', testament: 'OT', chapters: 50 },
  { id: 'Exod', usfm: 'EXO', name: 'Exodus', testament: 'OT', chapters: 40 },
  { id: 'Lev', usfm: 'LEV', name: 'Leviticus', testament: 'OT', chapters: 27 },
  { id: 'Num', usfm: 'NUM', name: 'Numbers', testament: 'OT', chapters: 36 },
  { id: 'Deut', usfm: 'DEU', name: 'Deuteronomy', testament: 'OT', chapters: 34 },
  { id: 'Josh', usfm: 'JOS', name: 'Joshua', testament: 'OT', chapters: 24 },
  { id: 'Judg', usfm: 'JDG', name: 'Judges', testament: 'OT', chapters: 21 },
  { id: 'Ruth', usfm: 'RUT', name: 'Ruth', testament: 'OT', chapters: 4 },
  { id: '1Sam', usfm: '1SA', name: '1 Samuel', testament: 'OT', chapters: 31 },
  { id: '2Sam', usfm: '2SA', name: '2 Samuel', testament: 'OT', chapters: 24 },
  { id: '1Kgs', usfm: '1KI', name: '1 Kings', testament: 'OT', chapters: 22 },
  { id: '2Kgs', usfm: '2KI', name: '2 Kings', testament: 'OT', chapters: 25 },
  { id: '1Chr', usfm: '1CH', name: '1 Chronicles', testament: 'OT', chapters: 29 },
  { id: '2Chr', usfm: '2CH', name: '2 Chronicles', testament: 'OT', chapters: 36 },
  { id: 'Ezra', usfm: 'EZR', name: 'Ezra', testament: 'OT', chapters: 10 },
  { id: 'Neh', usfm: 'NEH', name: 'Nehemiah', testament: 'OT', chapters: 13 },
  { id: 'Esth', usfm: 'EST', name: 'Esther', testament: 'OT', chapters: 10 },
  { id: 'Job', usfm: 'JOB', name: 'Job', testament: 'OT', chapters: 42 },
  { id: 'Ps', usfm: 'PSA', name: 'Psalms', testament: 'OT', chapters: 150 },
  { id: 'Prov', usfm: 'PRO', name: 'Proverbs', testament: 'OT', chapters: 31 },
  { id: 'Eccl', usfm: 'ECC', name: 'Ecclesiastes', testament: 'OT', chapters: 12 },
  { id: 'Song', usfm: 'SNG', name: 'Song of Solomon', testament: 'OT', chapters: 8 },
  { id: 'Isa', usfm: 'ISA', name: 'Isaiah', testament: 'OT', chapters: 66 },
  { id: 'Jer', usfm: 'JER', name: 'Jeremiah', testament: 'OT', chapters: 52 },
  { id: 'Lam', usfm: 'LAM', name: 'Lamentations', testament: 'OT', chapters: 5 },
  { id: 'Ezek', usfm: 'EZK', name: 'Ezekiel', testament: 'OT', chapters: 48 },
  { id: 'Dan', usfm: 'DAN', name: 'Daniel', testament: 'OT', chapters: 12 },
  { id: 'Hos', usfm: 'HOS', name: 'Hosea', testament: 'OT', chapters: 14 },
  { id: 'Joel', usfm: 'JOL', name: 'Joel', testament: 'OT', chapters: 3 },
  { id: 'Amos', usfm: 'AMO', name: 'Amos', testament: 'OT', chapters: 9 },
  { id: 'Obad', usfm: 'OBA', name: 'Obadiah', testament: 'OT', chapters: 1 },
  { id: 'Jonah', usfm: 'JON', name: 'Jonah', testament: 'OT', chapters: 4 },
  { id: 'Mic', usfm: 'MIC', name: 'Micah', testament: 'OT', chapters: 7 },
  { id: 'Nah', usfm: 'NAM', name: 'Nahum', testament: 'OT', chapters: 3 },
  { id: 'Hab', usfm: 'HAB', name: 'Habakkuk', testament: 'OT', chapters: 3 },
  { id: 'Zeph', usfm: 'ZEP', name: 'Zephaniah', testament: 'OT', chapters: 3 },
  { id: 'Hag', usfm: 'HAG', name: 'Haggai', testament: 'OT', chapters: 2 },
  { id: 'Zech', usfm: 'ZEC', name: 'Zechariah', testament: 'OT', chapters: 14 },
  { id: 'Mal', usfm: 'MAL', name: 'Malachi', testament: 'OT', chapters: 4 },
  { id: 'Matt', usfm: 'MAT', name: 'Matthew', testament: 'NT', chapters: 28 },
  { id: 'Mark', usfm: 'MRK', name: 'Mark', testament: 'NT', chapters: 16 },
  { id: 'Luke', usfm: 'LUK', name: 'Luke', testament: 'NT', chapters: 24 },
  { id: 'John', usfm: 'JHN', name: 'John', testament: 'NT', chapters: 21 },
  { id: 'Acts', usfm: 'ACT', name: 'Acts', testament: 'NT', chapters: 28 },
  { id: 'Rom', usfm: 'ROM', name: 'Romans', testament: 'NT', chapters: 16 },
  { id: '1Cor', usfm: '1CO', name: '1 Corinthians', testament: 'NT', chapters: 16 },
  { id: '2Cor', usfm: '2CO', name: '2 Corinthians', testament: 'NT', chapters: 13 },
  { id: 'Gal', usfm: 'GAL', name: 'Galatians', testament: 'NT', chapters: 6 },
  { id: 'Eph', usfm: 'EPH', name: 'Ephesians', testament: 'NT', chapters: 6 },
  { id: 'Phil', usfm: 'PHP', name: 'Philippians', testament: 'NT', chapters: 4 },
  { id: 'Col', usfm: 'COL', name: 'Colossians', testament: 'NT', chapters: 4 },
  { id: '1Thess', usfm: '1TH', name: '1 Thessalonians', testament: 'NT', chapters: 5 },
  { id: '2Thess', usfm: '2TH', name: '2 Thessalonians', testament: 'NT', chapters: 3 },
  { id: '1Tim', usfm: '1TI', name: '1 Timothy', testament: 'NT', chapters: 6 },
  { id: '2Tim', usfm: '2TI', name: '2 Timothy', testament: 'NT', chapters: 4 },
  { id: 'Titus', usfm: 'TIT', name: 'Titus', testament: 'NT', chapters: 3 },
  { id: 'Phlm', usfm: 'PHM', name: 'Philemon', testament: 'NT', chapters: 1 },
  { id: 'Heb', usfm: 'HEB', name: 'Hebrews', testament: 'NT', chapters: 13 },
  { id: 'Jas', usfm: 'JAS', name: 'James', testament: 'NT', chapters: 5 },
  { id: '1Pet', usfm: '1PE', name: '1 Peter', testament: 'NT', chapters: 5 },
  { id: '2Pet', usfm: '2PE', name: '2 Peter', testament: 'NT', chapters: 3 },
  { id: '1John', usfm: '1JN', name: '1 John', testament: 'NT', chapters: 5 },
  { id: '2John', usfm: '2JN', name: '2 John', testament: 'NT', chapters: 1 },
  { id: '3John', usfm: '3JN', name: '3 John', testament: 'NT', chapters: 1 },
  { id: 'Jude', usfm: 'JUD', name: 'Jude', testament: 'NT', chapters: 1 },
  { id: 'Rev', usfm: 'REV', name: 'Revelation', testament: 'NT', chapters: 22 }
]

export const BOOK_BY_ID: Record<string, BookMeta> = Object.fromEntries(
  BOOKS.map((b) => [b.id, b])
)
export const BOOK_BY_USFM: Record<string, BookMeta> = Object.fromEntries(
  BOOKS.map((b) => [b.usfm, b])
)

/** Total verse count of the KJV canon — used as a pipeline sanity assertion. */
export const KJV_VERSE_COUNT = 31102
