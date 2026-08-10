import { describe, it, expect } from 'vitest'
import { isArealFeature, AREAL_FEATURE_TYPES, KNOWN_FEATURE_TYPES } from '../src/shared/mapFeatures'

describe('map feature classification', () => {
  it('treats regions, rivers, valleys, and routes as areal (not precise points)', () => {
    for (const t of ['Region', 'Water', 'Valley', 'Path']) expect(isArealFeature(t)).toBe(true)
  })

  it('treats cities, landmarks, islands, mountains, and untyped places as points', () => {
    for (const t of ['City', 'Landmark', 'Island', 'Mountain', null, undefined, '']) {
      expect(isArealFeature(t)).toBe(false)
    }
  })

  it('every areal type is a known feature type (no typos / stray types)', () => {
    for (const t of AREAL_FEATURE_TYPES) expect(KNOWN_FEATURE_TYPES.has(t)).toBe(true)
  })
})
