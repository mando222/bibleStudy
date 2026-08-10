# Open Bible Study — project guide for Claude

A local-first, fully offline Bible study desktop app (Electron + React + TypeScript). All data is
public-domain / permissively licensed and bundled or built locally — **keep it that way: never add a
runtime network dependency, and never bundle GPL/copyleft or otherwise license-locked data.**

## Cutting a release

**The source of truth is [`docs/RELEASING.md`](docs/RELEASING.md). Follow it exactly.** Summary of
the rules that must not be skipped:

- **Every release requires a human-readable changelog entry.** Before bumping the version, add a
  dated `## [x.y.z] - YYYY-MM-DD` section to [`CHANGELOG.md`](CHANGELOG.md), written in plain
  language (what changed and why it matters — never a raw `git log`), grouped under
  Added / Changed / Fixed / Removed. CI **blocks the release** if the entry is missing, and this
  section becomes the GitHub Release notes.
- **Versioning is SemVer** (`MAJOR.MINOR.PATCH`). Confirm with the user which part to bump if it
  isn't obvious. The **git tag and GitHub Release are named `vX.Y.Z`** — created automatically by CI;
  never tag or publish by hand.
- **The trigger is a `package.json` version bump pushed to `main`.** Write the changelog first, bump
  `package.json` to match, then commit as `chore(release): x.y.z`.
- **Run the local gates first** and report results: `npm run typecheck`, `npm test`,
  `npm run db:build`, `npx vitest run test/db.test.ts`.
- **Pushing the version bump publishes to real users and is irreversible — only push when the user
  has explicitly approved this specific release.** Committing locally is fine without asking; the
  push is the outward-facing action that needs a clear yes.

## Everyday conventions

- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`, `refactor:`,
  `test:`). They also feed GitHub's auto release notes.
- **New bundled data** must be credited in `docs/attribution.md` and the in-app About screen, and
  must be public-domain or permissively licensed (PD / CC0 / CC BY / CC BY-SA — no GPL, no NC).
- **Verify changes** with `npm run typecheck` + `npm test`; when the data pipeline or `schema.sql`
  changed, also `npm run db:build` (its assertions gate the data) and re-run the packaged
  `--smoke-test`.
