import { describe, it, expect } from 'vitest'
import { pickReleaseAsset, type ReleaseAsset, isReleaseUrl, safeAssetFilename } from '../src/shared/releaseAssets'

// Verbatim asset names from the real v0.1.2 GitHub release.
const RELEASE: ReleaseAsset[] = [
  'Open.Bible.Study-0.1.2-amd64.deb',
  'Open.Bible.Study-0.1.2-mac-arm64.dmg',
  'Open.Bible.Study-0.1.2-setup.exe',
  'Open.Bible.Study-0.1.2-x86_64.AppImage'
].map((name) => ({ name, browser_download_url: `https://github.com/x/y/releases/download/v0.1.2/${name}` }))

describe('pickReleaseAsset', () => {
  it('picks the installer for each platform', () => {
    expect(pickReleaseAsset(RELEASE, 'darwin', 'arm64')?.name).toBe('Open.Bible.Study-0.1.2-mac-arm64.dmg')
    expect(pickReleaseAsset(RELEASE, 'win32', 'x64')?.name).toBe('Open.Bible.Study-0.1.2-setup.exe')
    // AppImage is named -x86_64 while electron-builder calls the arch x64.
    expect(pickReleaseAsset(RELEASE, 'linux', 'x64')?.name).toBe('Open.Bible.Study-0.1.2-x86_64.AppImage')
  })

  it('never offers a wrong-architecture macOS build', () => {
    // Only an arm64 .dmg is published — an Intel Mac must be sent to the release page instead.
    expect(pickReleaseAsset(RELEASE, 'darwin', 'x64')).toBeNull()
  })

  it('prefers AppImage over deb, and falls back to deb when that is all there is', () => {
    const debOnly = RELEASE.filter((a) => a.name.endsWith('.deb'))
    expect(pickReleaseAsset(debOnly, 'linux', 'x64')?.name).toBe('Open.Bible.Study-0.1.2-amd64.deb')
  })

  it('returns null rather than guessing when nothing matches', () => {
    expect(pickReleaseAsset([], 'linux', 'x64')).toBeNull()
    expect(pickReleaseAsset(RELEASE, 'linux', 'arm64')).toBeNull()
    expect(pickReleaseAsset(RELEASE, 'freebsd', 'x64')).toBeNull()
  })
})

describe('release download guards', () => {
  it('accepts only our release hosts, over https', () => {
    expect(isReleaseUrl('https://github.com/mando222/bibleStudy/releases/download/v1/a.dmg')).toBe(true)
    expect(isReleaseUrl('https://objects.githubusercontent.com/x/a.dmg')).toBe(true)
    expect(isReleaseUrl('http://github.com/a.dmg')).toBe(false)
    expect(isReleaseUrl('https://evil.com/a.dmg')).toBe(false)
    // An unescaped dot in the pattern would let this through.
    expect(isReleaseUrl('https://githubXcom/a.dmg')).toBe(false)
    expect(isReleaseUrl('https://github.com.evil.com/a.dmg')).toBe(false)
  })

  it('never lets a response-supplied name escape the Downloads folder', () => {
    expect(safeAssetFilename('Open.Bible.Study-0.2.5-mac-arm64.dmg')).toBe('Open.Bible.Study-0.2.5-mac-arm64.dmg')
    expect(safeAssetFilename('../../etc/passwd')).toBe('passwd')
    expect(safeAssetFilename('..\\..\\windows\\system32\\evil.exe')).toBe('evil.exe')
    expect(safeAssetFilename('/absolute/path.dmg')).toBe('path.dmg')
    expect(safeAssetFilename('..')).toBe('update')
    expect(safeAssetFilename('')).toBe('update')
    expect(safeAssetFilename('.bashrc')).toBe('bashrc')
    expect(safeAssetFilename('a b;rm -rf.dmg')).toBe('a_b_rm_-rf.dmg')
  })
})
