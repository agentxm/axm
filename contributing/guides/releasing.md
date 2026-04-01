# Releasing Guide

How `axm` releases are versioned, prepared, published, and checked. Use this
guide when planning a release, cutting the release commit, or checking whether a
prepared release is ready to publish.

> [Releasing](../../AGENTS.md#releasing) - release authority

## Key Resources

- [CONTRIBUTING.md](../../CONTRIBUTING.md) - contributor entry point
- [nx.json](../../nx.json) - fixed release group and tag format
- [CI workflow](../../.github/workflows/ci.yml) - validates release commits
- [Publish workflow](../../.github/workflows/publish.yml) - canonical publish
  path

---

## Release Model

- Releases are published from GitHub Actions. Do not publish packages or create
  GitHub Releases manually.
- `pnpm release:prepare` is the only supported local entry point for cutting a
  release commit.
- `packages/utils`, `packages/core`, and `packages/cli` are a fixed release
  group. Their versions must match.
- Pending version plans in `.nx/version-plans/*.md` and those three package
  manifests are the release version source of truth.
- Release tags use the `cli-v{SEMVER}` format, for example `cli-v0.1.0`.
- `pnpm release:plan` runs with `--only-touched=false` so release planning does
  not depend on touched-file detection.

---

## Release Flow

1. Plan the version bump in the PR.

   ```bash
   pnpm release:plan
   ```

   This records the intended semver bump and changelog entry. CI enforces the
   presence of a version plan for touched release projects with
   `pnpm release:plan:check`.

2. Prepare the release from clean, up-to-date `main`.

   ```bash
   pnpm release:prepare -- --dry-run
   pnpm release:prepare
   ```

   Dry-run previews the version and artifact changes. The real run validates the
   repo state, runs `pnpm run ci` via Nx `preVersionCommand`, consumes the
   pending version plan, updates `utils`/`core`/`cli`, refreshes
   `CHANGELOG.md`, commits the release artifacts, and pushes `release:
cli-v{VERSION}` to `origin/main`.

3. Wait for CI on that exact release commit.

   The release commit must complete the `ci.yml` workflow successfully before
   publishing. That run also produces the compiled artifacts used by the publish
   workflow.

4. Publish the GitHub release after CI is green.

   ```bash
   pnpm release:publish -- cli-v0.1.0 --dry-run
   pnpm release:publish -- cli-v0.1.0
   ```

   Dry-run previews the publish action. The real run validates the requested
   tag, confirms the matching release commit on `origin/main`, checks the
   release package versions at that commit, and requires a successful CI run
   before creating the GitHub Release.

5. Let GitHub Actions finish the publish.

   The GitHub Release triggers `publish.yml`, which validates the tag, downloads
   the matching CI artifacts, uploads release binaries, publishes npm packages
   through `nx release publish`, and updates Homebrew when
   `HOMEBREW_TAP_TOKEN` is configured.

---

## Checking State

Use these commands when you need to inspect a prepared release without a helper
script:

1. Fetch the latest `origin/main`.

   ```bash
   git fetch origin main
   ```

2. Find the latest prepared release commit on `origin/main`.

   ```bash
   git log origin/main --format='%H%x09%s' --perl-regexp --grep '^release: cli-v.*$' -n 1
   ```

   The output is `<sha><tab>release: <tag>`.

3. Check CI for that commit.

   ```bash
   gh run list --repo agentxm/axm --workflow ci.yml --commit <sha> --event push --limit 20 --json databaseId,status,conclusion,url
   ```

4. Check whether the tag exists on `origin`.

   ```bash
   git ls-remote --tags origin refs/tags/<tag>
   ```

5. Check whether the GitHub Release already exists.

   ```bash
   gh release view <tag> --repo agentxm/axm --json tagName,url,isDraft,isPrerelease,publishedAt
   ```

6. Re-run publish preflight without creating the release.

   ```bash
   pnpm release:publish -- <tag> --dry-run
   ```

   This is the strongest final check because it enforces the same preconditions
   as the real publish command.

---

## Notes

- If the tag version and package manifest versions do not match, publishing
  fails fast.
- `pnpm release` remains an alias for `pnpm release:prepare`.
- Homebrew automation requires the `HOMEBREW_TAP_TOKEN` repository secret in
  `agentxm/axm`.
