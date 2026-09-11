---
type: Environment
title: "AXM Linux CI"
description: "Container state, cache persistence, and trust boundaries for hosted and trusted Linux verification."
status: draft
uses-provider:
  - target: ../providers/github.md
    scope: GitHub-hosted PR runners, Actions cache, and workflow control
sources:
  - id: migration-source
    resource: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/contributing/guides/development-environment.md
    title: Pre-migration repository guidance
  - id: image-source
    resource: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/containers/ci/README.md
    title: Pre-migration CI-image cache guidance
generated:
  by: codex/gpt-6
  at: 2026-09-11T16:07:00Z
---

# AXM Linux CI

The CI image contains tools only. Source, Git metadata, dependencies,
credentials, and user state enter at runtime. The wrapper mounts the current
worktree and Git common directory at their existing absolute paths. It uses an
ephemeral home and anonymous root `node_modules` volume; Docker removes both
with the CI container. Its pnpm and Nx stores default to scoped Docker volumes.
An absolute `AXM_CI_PNPM_CACHE_VOLUME` or `AXM_CI_NX_CACHE_VOLUME` override is
instead treated as a bind mount; hosted PR verification uses this to restore
the stores independently through GitHub Actions. The Nx volume retains both
task artifacts and Nx's database-backed provenance metadata so a new ephemeral
runner can safely recognize restored entries; unknown-cache checks remain
enabled. The image entrypoint maps its non-root user to the host UID/GID,
keeping Linux bind mounts writable while preventing container installs from
replacing native-platform packages in the host `node_modules`. The launcher
sets a 65,536 file-descriptor limit for parallel test reliability across Docker
Desktop and Linux runners and defaults Nx to two concurrent project tasks;
hosted PR verification intentionally uses three. Use
`AXM_CONTAINER_NX_PARALLEL` or `AXM_CONTAINER_VITEST_MAX_WORKERS` to make another
substrate-specific override.

### Environment Checklist

- [ ] **Task branch** -- Start from a non-`main` branch or task worktree
- [ ] **Image pinned** -- Required CI uses a semantic image tag plus manifest
      digest
- [ ] **Source external** -- Repository source is mounted, never copied into an
      image layer
- [ ] **Identity external** -- GitHub and agent credentials remain runtime state
- [ ] **Native tests retained** -- macOS, Windows, and binary architecture jobs
      remain native

Trusted self-hosted runs reuse separate Docker volumes for the pnpm store and
Nx cache. Their names are scoped to this repository, the host architecture, the
digest-pinned image, and the lockfile contents. Pull-request jobs run only on
ephemeral GitHub-hosted runners, so untrusted changes cannot read or write the
persistent trusted-runner caches. The PR workflow restores separate,
branch-scoped GitHub Actions caches into host directories and bind-mounts them
into the container. The Nx cache includes task artifacts and the
database-backed metadata Nx uses to recognize their provenance; the launcher
does not disable Nx's unknown-cache safety check. Nx saves use commit-specific
immutable keys and can restore compatible entries from an earlier commit on
the same branch. An exact Actions cache restore that yields no Nx task hits
fails verification instead of silently rerunning the workspace. `node_modules`
remains an anonymous volume and is never persisted across runs. For recovery
or cache rotation, operators may set `AXM_CI_PNPM_CACHE_VOLUME` and
`AXM_CI_NX_CACHE_VOLUME` to another Docker volume name or absolute bind-mount
path.

## Purpose, access, and lifecycle

This context reproduces Linux verification using the [CI image](../tools/ci-image.md)
and repository pnpm/Nx commands. The
[launcher](../../scripts/container-environment.sh) owns mount and environment
configuration; [CI](../../.github/workflows/ci.yml) owns hosted and trusted runner
selection. Their permission and event gates are authoritative. The hosted and
trusted contexts differ in cache storage and trust even when they consume the
same image; neither implies native macOS or Windows verification.

Only authorized trusted runs use persistent self-hosted caches. Public/fork PR
code uses ephemeral GitHub-hosted runners. Source, Git metadata, identity, and
dependencies enter at runtime; credentials never belong in image layers.
Public artifacts follow repository public-context policy.

[Reproduce Linux CI](../runbooks/reproduce-linux-ci.md) defines readiness and
verification; [Upgrade the CI image](../runbooks/upgrade-ci-image.md) defines
image changes. Container teardown removes the ephemeral home and anonymous
dependency volume; named caches persist as described above. Do not delete
shared volumes as routine reset. Cache rotation must select the intended
repository/image/lockfile scope. Named-volume retirement and host capacity
administration have no documented assigned owner or retention schedule here.

## Accountability, gaps, and maintenance

Documentation maintainer: [@craigsmitham](https://github.com/craigsmitham), under
the [adoption declaration](../README.md). Repository workflow maintainers own configured jobs; host administration and cache-retirement responsibility require confirmation from the runner operators.

Review this record when runner selection, cache keys, mounts, image pins, data handling, or teardown behavior changes.

Migration source: [pre-migration repository guidance][migration-source].

[migration-source]: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/contributing/guides/development-environment.md
