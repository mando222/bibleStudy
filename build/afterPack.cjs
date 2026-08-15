// Ad-hoc code signing for the macOS bundle.
//
// `mac.identity: null` tells electron-builder to skip signing entirely — which is what we want,
// since there's no Developer ID certificate and looking for one would fail the CI build. But
// skipping it leaves the .app carrying only the linker's ad-hoc signature on the bare Electron
// binary, with no valid signature over the bundle as a whole. `codesign --verify` then fails with
// "code has no resources but signature indicates they must be present".
//
// A quarantined download with an INVALID signature is what macOS reports as
// "…is damaged and can't be opened. You should move it to the Trash." — a dead end whose only
// affirmative button deletes the app, and which right-click → Open cannot bypass.
//
// Applying a real ad-hoc signature over the assembled bundle makes the signature valid. The app is
// still unsigned by Apple's standards, so Gatekeeper still refuses it by policy — but it becomes
// the ordinary "unidentified developer" prompt, which right-click → Open (or System Settings →
// Privacy & Security → Open Anyway) clears in one step. Removing the warning altogether needs a
// Developer ID certificate plus notarization.
//
// Runs after the .app is assembled and before the .dmg/.zip are built, so the artifacts carry it.

const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)

  // --deep is deprecated by Apple for distribution signing, but it remains the practical way to
  // ad-hoc sign an Electron bundle's nested frameworks and unpacked native binaries in one pass.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })

  // Fail the build rather than ship an invalid signature — that's the whole point of this hook.
  execFileSync('codesign', ['--verify', '--strict', app], { stdio: 'inherit' })

  console.log(`  • ad-hoc signed ${app}`)
}
