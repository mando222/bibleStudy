# Cutting a release

Releases are driven by the **version number in `package.json`**. There are no tag
commands to remember.

## To publish a new release

1. Open `package.json` and bump `"version"` — e.g. `0.1.0` → `0.2.0`.
2. Commit and push to `main`:
   ```bash
   git commit -am "release v0.2.0"
   git push
   ```

That's it. GitHub Actions then:

- builds the installers for **macOS (Apple Silicon), Windows, and Linux** on native runners,
- and publishes a **GitHub Release** named `v0.2.0` with all the installers attached and
  auto-generated notes.

Watch it under the repo's **Actions** tab (~15 minutes). When it's green, the Release
appears under **Releases**, ready to share.

## Notes

- **One version = one release.** If you edit `package.json` for something other than the
  version (say, adding a dependency), nothing is re-released — the guard sees that version's
  tag already exists and skips.
- **Test builds without releasing:** Actions tab → *Build installers* → **Run workflow**.
  A manual run builds all three platforms (downloadable from the run's *Artifacts*) but does
  **not** publish a Release.
- **Versioning:** use simple `MAJOR.MINOR.PATCH` (e.g. `0.2.0`, `0.2.1`). The number also
  becomes the app/installer version.
- **Cost:** this is a private repo and GitHub bills macOS minutes at 10×, so keep it to a
  release or two a month. (Making the repo public makes CI free.)
