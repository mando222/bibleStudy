// Alphabet data for the Learn tab — authored here (public-domain factual data), no external source.
export interface Letter {
  upper: string
  lower: string
  name: string
  translit: string
  sound: string // plain-English pronunciation hint
  numeric?: number // Greek/Hebrew letters double as numerals
}
