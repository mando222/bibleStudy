// Which biblical "places" are areas/lines rather than points. A region (Galilee), a river (Jordan),
// a valley, or a route is NOT a single coordinate — drawing one precise pin for it is misleading, so
// the map hides these by default and shows them as clearly-approximate markers. Cities, settlements,
// landmarks, islands, and mountain peaks are point-like and shown as normal location dots.
//
// The full set of feature types in the bundled data (Theographic) is asserted in the test suite, so
// a new/unhandled type surfaces instead of silently being treated as a point.
export const AREAL_FEATURE_TYPES: ReadonlySet<string> = new Set(['Region', 'Water', 'Valley', 'Path'])

/** Every feature type present in the bundled places data — kept in sync via a DB test. */
export const KNOWN_FEATURE_TYPES: ReadonlySet<string> = new Set([
  'City',
  'Region',
  'Landmark',
  'Mountain',
  'Valley',
  'Water',
  'Island',
  'Path'
])

/** True if the feature is an area/line (region, river, valley, route) rather than a single point. */
export function isArealFeature(featureType: string | null | undefined): boolean {
  return AREAL_FEATURE_TYPES.has(featureType ?? '')
}
