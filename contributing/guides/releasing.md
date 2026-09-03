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

The binding obligations are the executable process specifications for the
canonical publish workflow, production-gate validation, and isolated candidate
state in the [specification catalog](../../specifications/catalog.md).

- Releases are published from GitHub Actions. Do not publish packages or create
  GitHub Releases manually.
- `pnpm release:prepare` is the only supported local entry point for cutting a
  release commit and opening its pull request.
- Every project tagged `release:cli` is part of one fixed release group. Their
  versions must match, and publication follows package dependency order.
- Pending version plans in `.nx/version-plans/*.md` and those package
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

   Both modes first use the committed source CLI and the skill package from the
   current version's matching release tag to verify production Registry
   authentication, immutable archive integrity, and the authoritative
   publish-preview contract. This disposable preflight worktree prevents
   next-version edits on `main` from being compared with the current immutable
   release. The preflight workspace exposes only that released skill as
   workspace-authored content; it does not consume the historic accepted
   resolution lockfile. No candidate state exists yet, so an expired token,
   incompatible Registry, or inability to reproduce the current release fails
   before CI or release generation.

   Preparation then creates a disposable detached Git worktree from the
   preflighted `main` commit and installs the locked workspace dependencies.
   Dry-run performs real versioning, changelog generation, bundled-skill
   generation, and an exact production Registry preview inside that worktree,
   then removes it without committing, pushing, opening a pull request, or
   publishing. Temporary writes inside the disposable worktree are what make
   the dry run faithful; the invoking checkout and external systems remain
   unchanged.

   The real run performs the same isolated candidate preparation, commits it in
   the detached worktree, pushes `release/cli-v{VERSION}`, opens the release
   pull request, and removes the worktree. The invoking checkout stays clean on
   `main` throughout.

3. Wait for pull request CI, then squash-merge with the exact release subject.

   ```bash
   gh pr merge --squash --subject "release: cli-v0.1.0" --delete-branch
   ```

   The exact subject is part of the publishing contract. The default GitHub
   squash subject includes the pull request number and must not be used.

4. Wait for CI on the merged release commit.

   The release commit must complete the `ci.yml` workflow successfully before
   publishing. That run also produces the compiled artifacts used by the publish
   workflow.

5. Publish the GitHub release after CI is green.

   ```bash
   pnpm release:publish -- cli-v0.1.0 --dry-run
   pnpm release:publish -- cli-v0.1.0
   ```

   Dry-run previews the publish action. The real run validates the requested
   tag, confirms the matching release commit on `origin/main`, checks the
   release package versions at that commit, and requires a successful CI run
   before creating the GitHub Release.

6. Let GitHub Actions finish the publish.

   The GitHub Release triggers `publish.yml`, which validates the tag, downloads
   the matching CI artifacts, uploads release binaries, and then promotes the
   validated release coordinate through the Control API. Promotion uses native
   HTTP preconditions: the first revision uses `If-None-Match: *`; later
   revisions use the strong ETag read from the public stable-channel object.
   Only after promotion succeeds does the workflow pack and publish every
   `release:cli` npm package in dependency order and update Homebrew when
   `HOMEBREW_TAP_TOKEN` is configured.

   This ordering makes the stable channel the release-selection authority while
   npm and Homebrew converge independently. A recovery rerun is idempotent. If
   the channel already names the requested coordinate, promotion returns the
   verified current state. If a newer release is already promoted, the workflow
   retains it and may continue repairing lagging distribution channels without
   rolling the channel back.

   If a release needs recovery after the GitHub Release already exists, run
   `publish.yml` manually with `workflow_dispatch` and the existing release tag.

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

## Local Preview Publish

`pnpm release:publish:local` publishes every `release:cli` npm package directly
from the working tree under a non-default dist-tag (default: `preview`). It is
for fast iteration only. It is not a substitute for the canonical CI release:
it skips cross-platform binaries, npm provenance, Homebrew, installer
verification, and the version-plan changelog flow.

```bash
pnpm release:publish:local -- --dry-run
pnpm release:publish:local
```

The script derives a unique preview version from the working tree
(`{patch+1}-preview.{unix}.{short-sha}[.dirty]`), builds the release group,
stamps the version into every release manifest, packs each package with
`pnpm pack`, then publishes each tarball in dependency order under the chosen
dist-tag. Manifests are restored in a `finally` block.

Install the published preview globally:

```bash
npm install -g axm.sh@preview
```

Optional flags:

- `--tag=<dist-tag>` - override the dist-tag (default `preview`; `latest` is
  refused).
- `--no-build` - skip the Nx build step when iterating on packaging only.
- `--dry-run` - run `npm publish --dry-run` against each tarball.

Login: requires `npm login` (no provenance is attached because OIDC is only
available from GitHub Actions).

---

## Notes

- If the tag version and package manifest versions do not match, publishing
  fails fast.
- Candidate-generation failures remove the owned disposable worktree and do
  not restore files in the invoking checkout because that checkout was never
  mutated. If cleanup itself fails, the command reports the exact temporary
  path for targeted recovery.
- A failed push creates no remote release branch. If the push succeeds but pull
  request creation fails, keep the remote branch and rerun the pull request
  recovery command printed by the tool; do not delete shared remote state as
  rollback.
- Homebrew automation requires the `HOMEBREW_TAP_TOKEN` repository secret in
  `agentxm/axm`.
- Stable-channel promotion requires `AXM_RELEASE_CONTROL_TOKEN`,
  `AXM_CONTROL_ACCESS_CLIENT_ID`, and `AXM_CONTROL_ACCESS_CLIENT_SECRET`. The
  bearer token is a workflow-bound principal with only `releases.promote`; the
  Cloudflare Access service token admits the workflow to the private Control
  surface.
