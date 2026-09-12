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
  at: 2026-09-12T16:23:31Z
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
Registry, npm, and tap permissions. It documents operations that commit, push,
publish, and change channels; a documentation task does not authorize them.
Use the exact release commit/tag as input and the canonical workflow as the
operation authority. Stop on a failed identity, authentication, integrity, or
CI gate; the recovery branches above determine the next permitted operation.

Completion is the canonical workflow's required distribution and verification
gates plus confirmed promotion for the exact candidate. Preserve its workflow
run, commit, tag, artifact identities, and final summary as evidence. A
superseded candidate is a separate terminal outcome, not promotion success.
An incomplete or uncertain publication returns to the release maintainer; do
not substitute manual writes or infer atomic rollback.

## Release Model

The binding obligations are the executable process specifications for the
canonical publish workflow, production-gate validation, and isolated candidate
state in the [specification catalog](../../specifications/catalog.md).

- Releases are published from GitHub Actions. Do not publish packages or create
  GitHub Releases manually.
- Release candidates are prepared only by explicitly dispatching
  `prepare-release.yml` with an exact current `main` commit. Do not cut or push
  a release commit from a local checkout.
- Run `pnpm run verify:affected` explicitly when local release verification is
  wanted. Git push does not repeat that broad workflow; pull-request and
  merged-commit CI remain authoritative.
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

   The workflow installs the locked workspace in its ephemeral checkout. Before
   candidate state exists, it uses the committed source CLI and the skill source
   from the latest reachable release tag at or before the current version to
   verify production Registry authentication, immutable archive integrity, and
   the authoritative publish-preview contract. If a failed candidate was merged
   but never published, preparation uses the preceding released tag instead of
   inventing a tag for the failed candidate. The preflight checkout exposes only
   that released skill as workspace-authored content; it does not consume the
   historic accepted resolution lockfile.

   After preflight, Nx Release versions the fixed cohort and changelog, stamps
   and regenerates the bundled skill, and previews the exact candidate against
   the production Registry. The workflow commits and pushes
   `release/cli-v{VERSION}`, opens the release pull request, records source and
   candidate provenance in its summary, and explicitly dispatches CI for the
   candidate commit. That dispatch is part of the contract: branch and pull
   request events created with the workflow token do not recursively start CI.
   No preparation step publishes a package, release, skill, or channel.

3. Wait for pull request CI, then squash-merge with the exact release subject.

   ```bash
   gh pr merge --squash --subject "release: cli-v0.1.0" --delete-branch
   ```

   The exact subject is part of the publishing contract. The default GitHub
   squash subject includes the pull request number and must not be used.

4. Wait for CI on the merged release commit.

   The release commit must complete the `ci.yml` workflow successfully before
   publishing. That exact push run compiles and smoke-tests the native binaries,
   packs the fixed npm cohort once, verifies reproducible bytes and package
   contents, and uploads both artifact families with commit identity. CI
   artifacts are retained for 90 days.

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

   The GitHub Release triggers `publish.yml`, which validates the exact tag and
   commit, downloads and validates matching CI binaries, npm tarballs,
   metadata, and checksums, then publishes those exact bytes and the Homebrew
   formula. The publish job never rebuilds or repacks npm packages. Every
   verification checkout is pinned to the resolved commit. Required evidence
   includes exact-version bash installations on Linux/macOS, PowerShell and cmd
   on Windows, clean published npm installations on Linux/macOS/Windows,
   pnpm and Yarn Classic on Linux, macOS Homebrew installation, and publication
   and installation of the matching official skill.

   Only after every required gate succeeds does the final job promote stable.
   Promotion uses `If-None-Match: *` for first creation and the public strong
   ETag for replacement, retaining representation preflight and artifact
   validation. An identical coordinate with identical validated descriptors is
   confirmed without mutation credentials. A lost submission response gets one
   bounded public readback and no repeated PUT; unsuccessful readback leaves
   promotion incomplete/uncertain. Readback does not independently verify an
   audit event.

   Recovery uses the same workflow with the existing `release_tag`, without a
   promotion-bypass input. Identical outputs are verified and reused; missing
   outputs are published; different content and failed existence reads stop the
   run. A successful or ambiguous write gets bounded readback; it is never
   repeated merely because public visibility is delayed. Missing tap
   credentials fail when a formula write is needed.

   If an exact-commit CI artifact has expired or is missing, publication fails
   before writes. Regenerate it only by dispatching `ci.yml` at the release tag,
   then rerun `publish.yml` for the same tag. CI verifies the commit, versions,
   reproducibility, and packlists again. Publication rejects incomplete,
   wrong-commit, wrong-version, or hash-mismatched cohorts; it never substitutes
   another run or silently packs from the publish checkout. npm provenance
   attests the publish workflow invocation, while the cohort manifest and
   successful CI run identify the earlier producer; provenance alone does not
   claim to attest that build step.

   Canonical releases share one concurrency group without canceling active
   runs. npm latest and the tap are checked before publication and at their
   write boundaries. An older candidate is superseded when newer distribution
   is observed; it does not repair historical distribution or move channels
   backward. Concurrent tap changes reject the push and require a fresh run.

   GitHub, npm, Homebrew, and the skill can become visible before stable. The
   published-release trigger also leaves an initial interval before binary
   attachment. Default public-script and native-manager installation therefore
   has its own discovery behavior; it is not stable-only. An interrupted release
   can remain partly published until a rerun or superseding release. There is
   no atomic cross-service transaction, automatic rollback, or propagation
   deadline. The always-run summary distinguishes distribution/verification
   failure, complete distribution with incomplete promotion, confirmed
   promotion, and superseded candidates.

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

## Local Preview Publish

For a working-tree package preview, follow [Publish a local preview](publish-local-preview.md).

## Notes

- If the tag version and package manifest versions do not match, publishing
  fails fast.
- Candidate-generation failures leave no developer checkout to clean because
  the runner is ephemeral. The workflow summary identifies the last resolved
  source, candidate, tag, branch, and pull request state.
- A failed push creates no remote release branch. If the push succeeds but a
  later step fails, keep and inspect the named remote branch as the recoverable
  outcome; do not delete shared remote state as rollback or blindly retry over
  it.
- Preparation requires the `AXM_REGISTRY_TOKEN` repository secret. Candidate
  branch, pull-request, and CI-dispatch authority comes from the job-scoped
  workflow token; no separate personal token is used.
- Homebrew automation requires the `HOMEBREW_TAP_TOKEN` repository secret in
  `agentxm/axm`.
- Stable-channel promotion requires `AXM_RELEASE_CONTROL_TOKEN`,
  `AXM_CONTROL_ACCESS_CLIENT_ID`, and `AXM_CONTROL_ACCESS_CLIENT_SECRET`. The
  bearer token is a workflow-bound principal with only `releases.promote`; the
  Cloudflare Access service token admits the workflow to the private Control
  surface.

## Accountability, gaps, and maintenance

Documentation maintainer: [@craigsmitham](https://github.com/craigsmitham), under
the [adoption declaration](../README.md). The authorized release maintainer performs the workflow; current publisher and incident-escalation assignments require confirmation from repository administrators.

Review this record when release entrypoints, cohort rules, publication gates, credentials, distribution channels, or recovery semantics change.

Exercise history is unknown: this migration inspected repository sources on
2026-09-11 and did not execute the procedure. Document status does not establish
execution authority or operational readiness.

Migration source: [pre-migration repository guidance][migration-source].

[migration-source]: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/contributing/guides/releasing.md
