// Picking the right installer out of a GitHub release. Kept pure (no Electron) so it can be
// unit-tested against the asset names our own release workflow actually produces — the names come
// from electron-builder.yml's artifactName patterns, and GitHub rewrites spaces to dots:
//   Open.Bible.Study-0.1.2-mac-arm64.dmg
//   Open.Bible.Study-0.1.2-setup.exe
//   Open.Bible.Study-0.1.2-x86_64.AppImage
//   Open.Bible.Study-0.1.2-amd64.deb

export interface ReleaseAsset {
  name: string
  browser_download_url: string
}

/** electron-builder, Debian and AppImage all spell the same architecture differently. */
function archAliases(arch: string): string[] {
  return arch === 'arm64' ? ['arm64', 'aarch64'] : ['x64', 'x86_64', 'amd64']
}

/**
 * The asset matching this platform/arch, or null when there isn't one — in which case the caller
 * should send the user to the release page. Returning null is deliberate: handing someone an
 * installer for the wrong architecture is worse than asking them to choose.
 */
export function pickReleaseAsset(
  assets: ReleaseAsset[],
  platform: string,
  arch: string
): ReleaseAsset | null {
  const find = (re: RegExp): ReleaseAsset | null => assets.find((a) => re.test(a.name)) ?? null
  const arches = archAliases(arch)

  if (platform === 'darwin') {
    for (const a of arches) {
      const hit = find(new RegExp(`-mac-${a}\\.dmg$`, 'i'))
      if (hit) return hit
    }
    return null // e.g. an Intel Mac when only an arm64 .dmg was published
  }

  if (platform === 'win32') return find(/-setup\.exe$/i)

  if (platform === 'linux') {
    for (const ext of ['AppImage', 'deb']) {
      for (const a of arches) {
        const hit = find(new RegExp(`[-._]${a}\\.${ext}$`, 'i'))
        if (hit) return hit
      }
    }
  }
  return null // unknown platform — send the user to the release page, don't guess
}
