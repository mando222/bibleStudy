import { describe, it, expect } from 'vitest'
import { parseVersion, compareVersions, isNewerVersion } from '../src/shared/semver'

describe('parseVersion', () => {
  it('accepts release tags with and without the v prefix', () => {
    expect(parseVersion('v0.1.2')).toEqual({ core: [0, 1, 2], prerelease: [] })
    expect(parseVersion('0.1.2')).toEqual({ core: [0, 1, 2], prerelease: [] })
    expect(parseVersion('1.0.0-rc.1')).toEqual({ core: [1, 0, 0], prerelease: ['rc', '1'] })
    expect(parseVersion('1.0.0+build.5')).toEqual({ core: [1, 0, 0], prerelease: [] })
  })
  it('rejects anything that is not SemVer', () => {
    for (const bad of ['', 'latest', '1.2', 'v1.2.x', 'nightly-2024']) {
      expect(parseVersion(bad), bad).toBeNull()
    }
  })
})

describe('compareVersions', () => {
  it('compares numerically, not lexically', () => {
    // The bug a string compare would introduce.
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1)
    expect(compareVersions('1.0.0', '0.99.99')).toBe(1)
    expect(compareVersions('0.1.2', '0.1.2')).toBe(0)
    expect(compareVersions('v0.1.3', '0.1.2')).toBe(1)
  })
  it('ranks a pre-release below its release', () => {
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(-1)
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBe(1)
    expect(compareVersions('1.0.0-rc.2', '1.0.0-rc.1')).toBe(1)
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha')).toBe(1)
  })
  it('treats an unparseable version as equal, so a bad tag never offers an update', () => {
    expect(compareVersions('garbage', '0.1.2')).toBe(0)
    expect(compareVersions('0.1.2', 'garbage')).toBe(0)
  })
})

describe('isNewerVersion', () => {
  it('is true only for a strictly newer, parseable version', () => {
    expect(isNewerVersion('v0.2.0', '0.1.2')).toBe(true)
    expect(isNewerVersion('v0.1.2', '0.1.2')).toBe(false)
    expect(isNewerVersion('v0.1.1', '0.1.2')).toBe(false)
    expect(isNewerVersion('v1.0.0-rc.1', '1.0.0')).toBe(false)
    expect(isNewerVersion('not-a-release', '0.1.2')).toBe(false)
  })
})
