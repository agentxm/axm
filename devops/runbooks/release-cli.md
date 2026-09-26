---
type: Runbook
title: "Release the AXM CLI"
description: "Prepare, publish, inspect, and recover an authorized CLI release using exact-commit CI artifacts and the canonical publish workflow."
status: draft
applies-to:
  - ../repositories/axm.md
  - ../providers/github.md
  - ../providers/npm.md
uses-tool:
  - ../tools/nx.md
sources:
  - id: migration-source
    resource: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/contributing/guides/releasing.md
    title: Pre-migration repository guidance
generated:
  by: codex/gpt-5
  at: 2026-09-25T13:00:00Z
---

# Release the AXM CLI

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

## Applicability, authority, and completion evidence

This procedure is for an authorized release maintainer with the required GitHub,
npm, and tap permissions. It documents operations that commit, push,
publish, and change channels; a documentation task does not authorize them.
Use the exact release commit/tag as input and the canonical workflow as the
operation authority. Stop on a failed identity, authentication, integrity, or
CI gate; the recovery branches above determine the next permitted operation.

Completion is the canonical workflow's required distribution and verification
gates for the exact candidate. Preserve its workflow run, commit, tag, artifact
identities, and final summary as evidence. A superseded candidate is a separate
terminal outcome, not successful completion. An incomplete or uncertain
publication returns to the release maintainer; do not substitute manual writes
or infer atomic rollback.

## Release Model

The binding obligations are the executable process specifications for the
canonical publish workflow, exact reviewable candidate generation, and isolated
candidate state in the [specification catalog](../../specifications/catalog.md).

- Releases are published from GitHub Actions. Do not publish packages or create
  GitHub Releases manually; the rollback procedure below only changes which
  existing release GitHub marks latest.
- Release candidates are prepared only by explicitly dispatching
  `prepare-release.yml` with an exact current `main` commit. Do not cut or push
  a release commit from a local checkout.
- Run `pnpm run verify:affected` explicitly when local release verification is
  wanted. Ordinary `main` pushes do not repeat broad source or platform
  verification; proposed-change CI is authoritative for those revisions.
  Canonical release commits are the exception: their exact push CI reruns the
  full source/platform gates and produces publication artifacts.
- Every project tagged `release:cli` is part of one fixed release group. Their
  versions must match, and publication follows package dependency order.
- That tag is the only place cohort membership is declared. Release tooling
  derives the package list, manifest paths, and publication order from it, so
  tagging a new publishable project is enough — there is no second list to
  update. A validator that judges a named commit resolves the cohort from that
  commit rather than from the current checkout.
- Pending version plans in `.nx/version-plans/*.md` and those package
  manifests are the release version source of truth.
- Release tags use the `cli-v{SEMVER}` format, for example `cli-v0.1.0`.
- `pnpm release:plan` runs with `--only-touched=false` so release planning does
  not depend on touched-file detection.

### GitHub Release asset inventory

The exact asset inventory is `EXPECTED_RELEASE_ASSETS` in
[`scripts/release-checksums.ts`](../../scripts/release-checksums.ts). It includes
native binaries, the binaries-only `SHA256SUMS` manifest, and release content:
installers, generated catalogs, and JSON Schemas.

CI stages the installer, catalog, and schema files as one exact-commit release-content
artifact. Publication downloads that artifact beside the five exact-commit
binaries, generates `SHA256SUMS` for the binaries only, rejects missing or
undeclared files, and applies the same immutable upload and integrity read-back
to every release asset. The content assets do not change the installers'
`SHA256SUMS` contract.

---

## Release Flow

1. Plan the version bump in the PR.

   ```bash
   pnpm release:plan
   ```

   This records the intended semver bump and changelog entry. CI enforces the
   presence of a version plan for touched release projects with
   `pnpm release:plan:check`. While the cohort remains below `1.0.0`, Nx's
   configured zero-major adjustment maps a `major` plan to the next minor
   version and a `minor` plan to the next patch version.

2. Dispatch candidate preparation for the exact current `main` commit.

   ```bash
   git fetch origin main
   source_sha="$(git rev-parse origin/main)"
   gh workflow run prepare-release.yml \
     --repo agentxm/axm \
     --ref main \
     --field source_sha="$source_sha"
   ```

   `source_sha` must be a full lowercase 40-character commit and must still equal
   `origin/main` both before generation and immediately before the candidate is
   pushed. If `main` advances, dispatch a fresh run for the new commit; do not
   update a generated release branch with a generic branch update.

   Source preparation checks that every npm cohort package already exists,
   before candidate generation. A new version of an
   existing package passes this check; a new package name requires first
   publication and canonical trusted-publisher setup. npm requires a package
   to exist before configuring its [trusted publisher](https://docs.npmjs.com/cli/v11/commands/npm-trust/#prerequisites).
   Public package metadata establishes existence, not publisher permissions.
   Failed npm reads stop preparation rather than being treated as absence.

   The workflow installs the locked workspace in its ephemeral checkout. Nx
   Release versions the fixed cohort and changelog, stamps and regenerates the
   bundled skill, then validates the exact cohort without contacting a private
   service. The workflow commits and pushes
   `release/cli-v{VERSION}`, opens the release pull request, records source and
   candidate provenance in its summary. GitHub creates the candidate's PR
   workflow in an approval-required state. No preparation step publishes a
   package, release, skill, or channel.

3. Review the prepared commit, then approve its PR workflow using GitHub's
   **Approve workflows to run** control or the workflow-run approval API.
   Verify that the run belongs to the exact prepared commit before approving.
   This uses the maintainer's existing release authority and repository write
   access. [GitHub's token behavior](https://docs.github.com/en/actions/concepts/security/github_token)
   explains the approval requirement for bot-created PRs.

   Wait for that PR's Required CI, then enqueue the accepted release pull
   request. Keep its generated title exactly `release: cli-v{VERSION}` and bind
   the command to the accepted source commit.

   ```bash
   gh pr merge <number> --repo agentxm/axm --auto --rebase \
     --match-head-commit <accepted-source-sha>
   ```

   The prepared commit has the generated release subject, and the rebase queue
   lands it on `main` unchanged as `release: cli-v{VERSION}`. CI and
   publication also recognize the `release: cli-v{VERSION} (#123)` form that
   earlier squash integration produced.
   The native merge queue verifies its synthesized integration SHA through
   `merge_group`; that temporary SHA is evidence for queue admission, not a
   release identity. Publication cannot run for a merge-group event.

4. Wait for CI and automatic publication on the rebase-merged release commit.

   The queue fast-forwards `main` to the verified merge-group revision. Resolve
   the release identity from the resulting `main` commit. That release commit
   must complete the `ci.yml` workflow successfully before
   publishing. That exact push run compiles and smoke-tests the native binaries,
   stages the installer/schema content, packs the fixed npm cohort once,
   verifies reproducible bytes and package contents, and uploads all three
   artifact families with commit identity. CI
   artifacts are retained for 90 days. Successful `push` CI on `main` continues
   automatically into `publish.yml`; the canonical release subject supplies
   the tag, and the completed run supplies the exact commit and CI run ID. No
   second routine operator command or public trigger is required.

   Non-release `main` commits cannot produce these artifact families. A manual
   artifact regeneration is accepted only when `ci.yml` is dispatched at the
   matching canonical `cli-v{VERSION}` tag; a manual branch run remains full
   assurance without release-grade artifacts.

5. Let GitHub Actions finish the publish.

   The `source` job runs [`resolve:release-source`](../../scripts/resolve-release-source.ts)
   to determine eligibility, mode, tag, and exact commit. That script owns the
   release-commit subject grammar and recovery lookup.
   The publication workflow validates the exact release commit and successful
   merged-revision CI run, downloads and validates its binaries, installer and
   schema content, npm tarballs, metadata, and checksums, and preflights every
   mutable distribution owner.
   The distribution preflight also rejects uninitialized npm packages before
   any output is written, except during the explicit first-package setup below.
   It then prepares an exact draft GitHub Release, distributes those exact
   bytes and the Homebrew formula, and publishes the release only after
   distribution succeeds. The publish job never rebuilds or repacks stable npm
   packages. Every verification checkout is pinned to the resolved commit.
   Required evidence
   includes exact-version bash installations on Linux/macOS, PowerShell and cmd
   on Windows, clean published npm installations on Linux/macOS/Windows,
   pnpm and Yarn Classic on Linux, and macOS Homebrew installation.

   Recovery uses the same workflow with the existing `release_tag`:

   ```bash
   gh workflow run publish.yml \
     --repo agentxm/axm \
     --ref main \
     --field mode=stable-recovery \
     --field release_tag=cli-v0.1.0
   ```

   Identical outputs are verified and reused; missing outputs are published;
   different content and failed existence reads stop the run. A successful or
   ambiguous write gets bounded readback; it is never repeated merely because
   public visibility is delayed. Missing tap credentials fail when a formula
   write is needed.

   npm publication preflights the complete cohort, then publishes in dependency
   order. Each package must have confirmed matching bytes before its consumers
   can be published. A dependency failure stops subsequent publication; an
   ambiguous response gets readback within that package's observation window.
   Independent GitHub Release assets retain concurrent readback.

   If an exact-commit CI artifact has expired or is missing, publication fails
   before writes. Regenerate it only by dispatching `ci.yml` at the release tag,
   then rerun `publish.yml` for the same tag. CI verifies the commit, versions,
   reproducibility, and packlists again. Publication rejects incomplete,
   wrong-commit, wrong-version, or hash-mismatched cohorts; it never substitutes
   another run or silently packs from the publish checkout. npm provenance
   attests the publish workflow invocation, while the cohort manifest and
   successful CI run identify the earlier producer; provenance alone does not
   claim to attest that build step.

   If a published release must be rolled back, first verify the previous GitHub
   Release and its installation evidence, then mark that release as latest:

   ```bash
   gh release edit <previous-tag> --repo agentxm/axm --latest
   ```

   This restores GitHub's stable release selection for installers and native
   managers. It does not delete immutable release assets or npm packages, and
   it is not an atomic rollback of npm or Homebrew state.

   Canonical releases share one concurrency group without canceling active
   runs. npm latest and the tap are checked before publication and at their
   write boundaries. An older candidate is superseded when newer distribution
   is observed; it does not repair historical distribution or move those
   owners backward. Concurrent tap changes reject the push and require a fresh
   run.

   npm, Homebrew, and the draft GitHub Release assets can exist before stable;
   the GitHub Release becomes public only after distribution completes. Default
   public-script and native-manager installation therefore has its own
   discovery behavior; it is not stable-only. An interrupted release can remain
   partly published until a rerun or superseding release. There is no atomic
   cross-service transaction, automatic rollback, or propagation deadline. The
   always-run summary distinguishes completed distribution and verification,
   incomplete attempts, and superseded candidates.

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

6. Inspect the canonical publication run for that exact commit.

   ```bash
   gh run list --repo agentxm/axm --workflow publish.yml --limit 20 \
     --json databaseId,event,status,conclusion,url
   ```

   The automatic run is a `workflow_run` event. Its source summary must name the
   exact tag, commit, and CI run; its final summary records distribution and
   verification state.

## Bootstrap prerelease

When a published CLI is unavailable or cannot execute the candidate-generation
workflow, publish a bootstrap prerelease from the exact current `main` revision:

```bash
source_sha="$(git rev-parse origin/main)"
gh workflow run publish.yml \
  --repo agentxm/axm \
  --ref main \
  --field mode=bootstrap-prerelease \
  --field source_sha="$source_sha"
```

This is an explicit exceptional mode of the canonical workflow, not a
working-tree publisher. It derives a deterministic preview version from the
workflow run and source commit, publishes the fixed cohort with provenance
under the `preview` dist-tag, and verifies an exact global installation. It
refuses a stale source revision or a preview tag that has already advanced.

## Branch preview for a consumer PR

When a consumer repository must test unreleased AXM changes before the public
PR merges, dispatch CI and then the canonical publish workflow at the exact
current public branch head:

```bash
source_ref=codex/extension-deprecation
git fetch origin "$source_ref"
source_sha="$(git rev-parse FETCH_HEAD)"
gh workflow run ci.yml --repo agentxm/axm --ref "$source_ref"
# Wait for successful CI on source_sha before publishing.
gh workflow run publish.yml \
  --repo agentxm/axm \
  --ref "$source_ref" \
  --field mode=branch-preview \
  --field source_sha="$source_sha" \
  --field source_ref="$source_ref"
```

The workflow accepts only the exact current head of the named non-main branch
and a successful CI run for that commit. It publishes the complete immutable
npm cohort under a deterministic `preview` version and verifies an exact
global installation. Pin the consumer to the resulting exact version. If the
branch advances, rerun CI and publish a new preview from the new head; an old
preview remains immutable.

## First npm package setup

Use this only when the reviewed cohort introduces package names that do not yet
exist on npm. Inspect the names and ownership through the npm account before
creating them. npm's [trusted-publisher setup](https://docs.npmjs.com/trusted-publishers/)
requires an existing package, so the first publication needs an authenticated
creation step.

1. Create a short-lived npm credential with only the scope needed for those
   package creations and permission for authenticated CI publishing, following
   [npm's access-token instructions](https://docs.npmjs.com/creating-and-viewing-access-tokens/).
   Store it as the repository Actions secret `NPM_INITIAL_PUBLISH_TOKEN` through
   the secret interface; never place its value in a command argument or log.
2. Dispatch the canonical `publish.yml` workflow with
   `initialize_npm_packages=true`. For a partially distributed stable release,
   use `mode=stable-recovery` and its existing `release_tag`; stable recovery
   consumes the original verified CI tarballs. For package setup before candidate
   preparation, use the bootstrap-prerelease dispatch above with the additional
   flag. All source, integrity, dependency-order and verification gates still
   apply.
3. Confirm the missing packages' exact versions and integrity in the workflow's
   readback. Configure each new package's trusted publisher for GitHub
   organization `agentxm`, repository `axm`, workflow `publish.yml`, with direct
   publication enabled. Do not add an environment restriction unless the
   corresponding job declares that environment.
4. Revoke the temporary npm credential and remove `NPM_INITIAL_PUBLISH_TOKEN`
   from Actions. Continue normal preparation or exact-tag recovery with the
   initialization input disabled, and retain the completed cohort evidence.

The initialization input defaults to false and is effective only on an explicit
dispatch. `setup-node` supplies npm's registry-access configuration; Effect Config
loads the credential once as a redacted value. Only a missing package's npm
publish process receives it. Existing packages use trusted publishing, and tag
repair never receives this credential. A missing or rejected credential stops
publication; package existence alone does not establish publisher authorization.

This setup path has local configuration and failure-path coverage; its first
authenticated workflow exercise remains outstanding until recorded by the
maintainer. It does not provide a local or placeholder-package publisher.

## Notes

- If the tag version and package manifest versions do not match, the source
  resolver rejects the run before any job with publication credentials starts.
- Candidate-generation failures leave no developer checkout to clean because
  the runner is ephemeral. The workflow summary identifies the last resolved
  source, candidate, tag, branch, and pull request state.
- A failed push creates no remote release branch. If the push succeeds but a
  later step fails, keep and inspect the named remote branch as the recoverable
  outcome; do not delete shared remote state as rollback or blindly retry over
  it.
- Candidate branch and pull-request authority comes from the job-scoped workflow
  token. A maintainer approves the prepared PR workflow using their existing
  GitHub access; preparation needs no additional credential or Actions write
  permission.
- Homebrew automation requires the `HOMEBREW_TAP_TOKEN` repository secret in
  `agentxm/axm`.

## Accountability, gaps, and maintenance

Documentation maintainer: [@craigsmitham](https://github.com/craigsmitham), under
the [adoption declaration](../README.md). The authorized release maintainer performs the workflow; current publisher and incident-escalation assignments require confirmation from repository administrators.

Review this record when release entrypoints, cohort rules, publication gates, credentials, distribution channels, or recovery semantics change.

Exercise history is unknown: this migration inspected repository sources on
2026-09-11 and did not execute the procedure. Document status does not establish
execution authority or operational readiness.

Migration source: [pre-migration repository guidance][migration-source].

[migration-source]: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/contributing/guides/releasing.md
