import { describe, it, expect } from 'vitest'
import { pickReleaseAsset, type ReleaseAsset } from '../src/shared/releaseAssets'

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
