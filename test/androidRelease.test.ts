import { describe, expect, it } from 'vitest'
import { latestAndroidRelease } from '../mobile/src/androidRelease'

const stagedApk = 'Open-Bible-Study-Android-test.apk'

function release(tag: string, name: string) {
  const url = 'https://github.com/mando222/bibleStudy/releases/download/' +
    encodeURIComponent(tag) + '/' + encodeURIComponent(name)
  return { tag_name: tag, assets: [{ name, browser_download_url: url }] }
}

describe('Android release selection', () => {
  it('offers the staged APK on a newer shared release, even to an older Android build', () => {
    const update = release('v0.4.2', stagedApk)
    expect(latestAndroidRelease([update, release('v0.4.3', 'Open Bible Study.dmg')], '0.2.0'))
      .toEqual({ version: '0.4.2', url: update.assets[0].browser_download_url })
    expect(latestAndroidRelease([update], '0.4.2')).toBeNull()
    expect(latestAndroidRelease([release('v0.4.3', 'another-app.apk')], '0.4.2')).toBeNull()
  })

  it('requires matching tag and artifact versions when both identify a version', () => {
    const name = 'Open-Bible-Study-Android-0.4.3.apk'
    expect(latestAndroidRelease([release('v0.4.3', name)], '0.4.2')?.version).toBe('0.4.3')
    expect(latestAndroidRelease([release('v0.5.0', name), release('android-v0.5.0', name)], '0.4.2')).toBeNull()
  })

  it('continues to read older Android tags and explicitly versioned APK names', () => {
    const tagged = release('android-v0.2.1', 'app-debug.apk')
    const named = release('android-dev', 'Open-Bible-Study-Android-0.2.2-test.apk')
    expect(latestAndroidRelease([tagged], '0.2.0')?.version).toBe('0.2.1')
    expect(latestAndroidRelease([named, tagged], '0.2.0')?.version).toBe('0.2.2')
  })

  it('ignores unpublished releases and assets with a mismatched download URL', () => {
    const update = release('v0.4.3', stagedApk)
    const mismatched = release('v0.4.4', stagedApk)
    mismatched.assets[0].browser_download_url = update.assets[0].browser_download_url
    expect(latestAndroidRelease([{ ...update, draft: true }, { ...update, prerelease: true }, mismatched], '0.4.2'))
      .toBeNull()
  })
})
