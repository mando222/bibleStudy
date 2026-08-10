import type { Letter } from './alphabet'

// The 24 letters of the Koine Greek alphabet. Sound hints follow common Erasmian teaching usage.
export const GREEK_ALPHABET: Letter[] = [
  { upper: 'Α', lower: 'α', name: 'alpha', translit: 'a', sound: 'a as in father', numeric: 1 },
  { upper: 'Β', lower: 'β', name: 'beta', translit: 'b', sound: 'b as in boy', numeric: 2 },
  { upper: 'Γ', lower: 'γ', name: 'gamma', translit: 'g', sound: 'g as in got', numeric: 3 },
  { upper: 'Δ', lower: 'δ', name: 'delta', translit: 'd', sound: 'd as in dog', numeric: 4 },
  { upper: 'Ε', lower: 'ε', name: 'epsilon', translit: 'e', sound: 'e as in met', numeric: 5 },
  { upper: 'Ζ', lower: 'ζ', name: 'zeta', translit: 'z', sound: 'z as in daze (dz)', numeric: 7 },
  { upper: 'Η', lower: 'η', name: 'eta', translit: 'ē', sound: 'e as in obey (long)', numeric: 8 },
  { upper: 'Θ', lower: 'θ', name: 'theta', translit: 'th', sound: 'th as in thin', numeric: 9 },
  { upper: 'Ι', lower: 'ι', name: 'iota', translit: 'i', sound: 'i as in machine', numeric: 10 },
  { upper: 'Κ', lower: 'κ', name: 'kappa', translit: 'k', sound: 'k as in kit', numeric: 20 },
  { upper: 'Λ', lower: 'λ', name: 'lambda', translit: 'l', sound: 'l as in law', numeric: 30 },
  { upper: 'Μ', lower: 'μ', name: 'mu', translit: 'm', sound: 'm as in mom', numeric: 40 },
  { upper: 'Ν', lower: 'ν', name: 'nu', translit: 'n', sound: 'n as in now', numeric: 50 },
  { upper: 'Ξ', lower: 'ξ', name: 'xi', translit: 'x', sound: 'x as in axe (ks)', numeric: 60 },
  { upper: 'Ο', lower: 'ο', name: 'omicron', translit: 'o', sound: 'o as in not', numeric: 70 },
  { upper: 'Π', lower: 'π', name: 'pi', translit: 'p', sound: 'p as in pet', numeric: 80 },
  { upper: 'Ρ', lower: 'ρ', name: 'rho', translit: 'r', sound: 'r (trilled)', numeric: 100 },
  { upper: 'Σ', lower: 'σ/ς', name: 'sigma', translit: 's', sound: 's as in sit (ς at word end)', numeric: 200 },
  { upper: 'Τ', lower: 'τ', name: 'tau', translit: 't', sound: 't as in top', numeric: 300 },
  { upper: 'Υ', lower: 'υ', name: 'upsilon', translit: 'y/u', sound: 'u as in French tu', numeric: 400 },
  { upper: 'Φ', lower: 'φ', name: 'phi', translit: 'ph', sound: 'ph as in phone', numeric: 500 },
  { upper: 'Χ', lower: 'χ', name: 'chi', translit: 'ch', sound: 'ch as in Bach', numeric: 600 },
  { upper: 'Ψ', lower: 'ψ', name: 'psi', translit: 'ps', sound: 'ps as in lips', numeric: 700 },
  { upper: 'Ω', lower: 'ω', name: 'omega', translit: 'ō', sound: 'o as in tone (long)', numeric: 800 }
]
