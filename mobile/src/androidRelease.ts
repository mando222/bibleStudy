import { compareVersions, isNewerVersion, parseVersion } from '@shared/semver'

const project = 'https://github.com/mando222/bibleStudy'
export type Release = {
  draft?: boolean
  prerelease?: boolean
  tag_name?: string
  assets?: { name?: string; browser_download_url?: string }[]
}
export type AndroidUpdate = { version: string; url: string }

/** A shared release can supply the version of the standard unversioned test APK. */
export function latestAndroidRelease(releases: Release[], installed: string) {
  let next: AndroidUpdate | null = null
  for (const release of releases) {
    if (release.draft || release.prerelease || !release.tag_name) continue
    const androidTag = /^android[-/]v?(\d+\.\d+\.\d+)$/i.exec(release.tag_name)?.[1]
    const sharedTag = /^v(\d+\.\d+\.\d+)$/.exec(release.tag_name)?.[1]
    const tagVersion = androidTag ?? sharedTag
    for (const asset of release.assets ?? []) {
      const name = asset.name ?? ''
      if (!name.toLowerCase().endsWith('.apk') || !asset.browser_download_url) continue
      const fileVersion =
        /^open[- ]?bible[- ]?study[- ](?:android[- ])?v?(\d+\.\d+\.\d+)(?:[- ](?:android|universal|test))*\.apk$/i.exec(
          name
        )?.[1]
      if (tagVersion && fileVersion && tagVersion !== fileVersion) continue
      const version = fileVersion ?? androidTag ?? (name === 'Open-Bible-Study-Android-test.apk' ? sharedTag : undefined)
      if (!version || !parseVersion(version) || !isNewerVersion(version, installed)) continue
      const expected =
        project + '/releases/download/' + encodeURIComponent(release.tag_name) + '/' + encodeURIComponent(name)
      if (asset.browser_download_url !== expected) continue
      if (!next || compareVersions(version, next.version) > 0) next = { version, url: expected }
    }
  }
  return next
}
