---
type: Runbook
title: "Reproduce AXM Linux CI"
description: "Run the pinned Linux verification environment when reproducing a repository CI result locally or on a Docker-only host."
status: draft
applies-to:
  - ../repositories/axm.md
  - ../environments/linux-ci.md
uses-tool:
  - ../tools/ci-image.md
  - ../tools/nx.md
sources:
  - id: migration-source
    resource: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/contributing/guides/development-environment.md
    title: Pre-migration repository guidance
generated:
  by: codex/gpt-6
  at: 2026-09-11T16:07:00Z
---

# Reproduce AXM Linux CI

## Preconditions

Identify the checkout/commit and preserve its current changes. A Docker engine
must be available; a pnpm-equipped host also needs the repository toolchain and
explicit dependency preparation. The Docker-only exception below applies where
that host toolchain is absent. Follow [Linux CI](../environments/linux-ci.md)
for mount, cache, trust, and persistence boundaries.

## CI Container Use

`pnpm run container:ci` and `pnpm run container:smoke` are the published
workflow names for container CI, and are how the container environment is
invoked:

```bash
pnpm run container:ci
pnpm run container:smoke
```

Override `AXM_CI_IMAGE` only to test an intentional image upgrade.

Both names run `scripts/container-environment.sh`, which is their
implementation rather than a second entry point. Invoke that path directly only
where no host toolchain is installed and there is therefore no `pnpm` to
resolve the published name — Docker-only reproduction, and the CI container
jobs, which install no toolchain by design:

```bash
scripts/container-environment.sh ci
scripts/container-environment.sh smoke
```

That path invocation is a recorded exception in the
[Repository task interface](../../docs/guides/repository-task-interface.md); do
not add flags or environment to the `container:*` scripts without updating the
CI call sites in the same change, since those two forms could otherwise
diverge.

The repository-owned CI image is public and must remain anonymously pullable.
Public and fork PR code runs on ephemeral GitHub-hosted runners, never a
persistent self-hosted runner.

### Container Checklist

- [ ] **Docker available** -- The host or VM Docker engine is running
- [ ] **Smoke green** -- `pnpm run container:smoke` passes
- [ ] **Normal commands used** -- CI runs through repository `pnpm` scripts
- [ ] **Dependencies isolated** -- Container package payloads use the Docker
      dependency volume rather than native `node_modules`

## Completion, stop, and recovery

Run the container smoke before the full CI workflow when establishing the host.
Success is a zero exit result for the selected workflow against the identified
checkout and image, with its emitted reports retained. Record commit, image
digest, command, host architecture, and result; this does not establish native
Windows/macOS or installed-release coverage.

Stop on image-pull, Docker, dependency, or verification failure and retain the
specific diagnostic. Correct the prerequisite or implementation through its
owner before rerunning. Do not replace the pinned image merely to obtain a pass
or delete shared cache volumes as blanket recovery. Container teardown owns
ephemeral state; cache rotation follows the environment's scoped overrides.

## Accountability, gaps, and maintenance

Documentation maintainer: [@craigsmitham](https://github.com/craigsmitham), under
the [adoption declaration](../README.md). The host operator controls Docker and local state; repository workflow maintainers own the verification contract. Named host-support escalation remains undocumented.

Review this record when container entrypoints, image pins, Docker mounts, cache policy, or verification workflows change.

Exercise history is unknown: this migration inspected repository sources on
2026-09-11 and did not execute the procedure. Document status does not establish
execution authority or operational readiness.

Migration source: [pre-migration repository guidance][migration-source].

[migration-source]: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/contributing/guides/development-environment.md
