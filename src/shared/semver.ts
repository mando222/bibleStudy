// Minimal SemVer comparison for the update check. A string compare would get this wrong in the
// ways that matter ("0.10.0" < "0.9.0", "v1.0.0" != "1.0.0"), and a pre-release must never be
// offered as an upgrade over the matching release.

interface Parsed {
  core: [number, number, number]
  prerelease: string[]
}

/** Parse "v1.2.3", "1.2.3", or "1.2.3-beta.1". Returns null for anything that isn't SemVer. */
export function parseVersion(input: string): Parsed | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(input.trim())
  if (!m) return null
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    prerelease: m[4] ? m[4].split('.') : []
  }
}

/** Compare two pre-release identifier lists per the SemVer spec. */
function comparePrerelease(a: string[], b: string[]): number {
  // No pre-release outranks any pre-release: 1.0.0 > 1.0.0-rc.1
  if (!a.length && !b.length) return 0
  if (!a.length) return 1
  if (!b.length) return -1
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i]
    const y = b[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1
    } else if (nx !== ny) {
      return nx ? -1 : 1 // numeric identifiers rank below alphanumeric ones
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/** -1 / 0 / 1. Unparseable versions sort as equal, so a malformed tag never triggers an update. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return 0
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] < pb.core[i] ? -1 : 1
  }
  return comparePrerelease(pa.prerelease, pb.prerelease)
}

/** True only when `latest` is strictly newer than `current` and both parse. */
export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0
}
