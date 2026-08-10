# Cutting a release

Releases are driven by the **version number in `package.json`**. Bumping it on `main` is the
trigger — there are no tag commands to run by hand. But a release is not just a version bump: it
must ship a **human-readable changelog entry**, and CI will refuse to publish without one.

This document is the source of truth for **anyone (including Claude) cutting a release.**

---

## Conventions (do not deviate)

- **Versioning:** [Semantic Versioning](https://semver.org) — `MAJOR.MINOR.PATCH`.
  - **PATCH** (`0.1.2 → 0.1.3`): bug fixes / small changes only.
  - **MINOR** (`0.1.2 → 0.2.0`): new features, backwards-compatible.
  - **MAJOR** (`0.x → 1.0.0`): reserved for the first stable release / breaking changes.
- **Git tag:** `vMAJOR.MINOR.PATCH` — e.g. `v0.1.3`. Created automatically by CI (never tag by hand).
- **GitHub Release name:** identical to the tag — `v0.1.3`.
- **Changelog:** every release has a dated `## [x.y.z] - YYYY-MM-DD` section in
  [`CHANGELOG.md`](../CHANGELOG.md), grouped under Added / Changed / Fixed / Removed. Written for
  humans, not as a raw commit dump.
- **Release commit message:** `chore(release): x.y.z`.
- **Everyday commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`, `refactor:`,
  `test:`) — these also feed GitHub's auto "What's Changed" notes.

---

## Steps to publish a release

1. **Make sure `main` is green and you're on it** with the release changes merged/committed.

2. **Run the local gates** (the same ones CI runs — catch failures before spending CI minutes):
   ```bash
   npm run typecheck
   npm test
   npm run db:build        # data-pipeline assertions must pass
   npx vitest run test/db.test.ts
   ```

3. **Write the changelog.** Add a new section to [`CHANGELOG.md`](../CHANGELOG.md) at the top
   (below `## [Unreleased]`):
   ```markdown
   ## [0.1.3] - 2026-08-15
   ### Added
   - Plain-language description of each new feature and why it matters.
   ### Fixed
   - Plain-language description of each fix.
   ```
   Move anything from `## [Unreleased]` into it and reset `## [Unreleased]` to `_Nothing yet._`.
   Use today's date (`YYYY-MM-DD`). **This is required — CI blocks the release if the section is
   missing.** The contents of this section become the GitHub Release notes.

4. **Bump the version** in `package.json` to match the changelog (`"version": "0.1.3"`).

5. **Commit and push to `main`:**
   ```bash
   git commit -am "chore(release): 0.1.3"
   git push
   ```

That's it. GitHub Actions then, only if `v0.1.3` doesn't already exist and the changelog entry is
present:

- runs typecheck + unit tests,
- builds installers for **macOS (Apple Silicon), Windows, and Linux** on native runners,
- rebuilds the Bible database (pipeline assertions gate the data) and runs the DB-integrity test,
- **smoke-tests the packaged app** on each OS (it boots, opens the DB, loads native deps),
- and publishes a **GitHub Release** named `v0.1.3`, tagged `v0.1.3`, with your changelog section as
  the notes (plus a download table and GitHub's auto "What's Changed"), and all installers attached.

Watch it under the repo's **Actions** tab (~15 minutes). When green, the Release appears under
**Releases**, ready to share.

---

## Pre-flight checklist

- [ ] On `main`, working tree clean, changes merged.
- [ ] `npm run typecheck` and `npm test` pass locally.
- [ ] `npm run db:build` passes its assertions (needed whenever the data pipeline or schema changed).
- [ ] `CHANGELOG.md` has a dated `## [x.y.z]` section describing this release in plain language.
- [ ] `package.json` `version` matches that changelog section.
- [ ] Any new bundled data source is credited in `docs/attribution.md` and the in-app About screen.

---

## Notes

- **One version = one release.** Editing `package.json` for something other than the version (a new
  dependency, say) does not re-release — CI sees the tag already exists and skips.
- **Test builds without releasing:** Actions tab → *Build installers* → **Run workflow**
  (`workflow_dispatch`). This builds all three platforms (downloadable from the run's *Artifacts*)
  but does **not** publish a Release, and does not require the changelog entry.
- **The version is the app/installer version** shown in the About screen.
- **Cost:** private-repo macOS minutes bill at 10×, so keep it to a release or two a month. (Making
  the repo public makes CI free.)

---

## For Claude

When asked to "cut a release" / "publish a release" / "ship vX.Y.Z":

1. Follow the **Steps** above in order. Do **not** bump `package.json` before the changelog entry
   exists — CI will reject it, and the version-bump commit is the irreversible release trigger.
2. **Always write the `CHANGELOG.md` entry first**, in plain human language (summarize what changed
   and why — never paste a raw `git log`). Ask the user which version part to bump (patch/minor/major)
   if it isn't obvious from the changes.
3. Run the local gates (step 2) and report the results before pushing.
4. Pushing the version bump to `main` publishes to real users — treat it as an outward-facing,
   irreversible action: **only push when the user has explicitly approved this specific release.**
   Committing locally is fine; pushing needs a clear yes.
5. Never create tags or GitHub Releases by hand — CI owns tagging (`vX.Y.Z`) and publishing.
