---
status: active
last-reviewed: 2026-07-18
version: 0.2.0
description: Choosing and using AXM's native, development-container, and repository-owned
  Linux CI environments.
depends-on:
  - ../../CONTRIBUTING.md
  - ../../AGENTS.md
---

# Development Environment

AXM supports a repository-owned Linux CI image, a shared interactive development
image, and native development. The development image is the documented default
for Linux feature work; the CI image reproduces required Linux verification.
Every mode uses `mise.toml` as the repository tool-version authority and the
same `pnpm`/Nx commands. Images do not replace native macOS, Windows, or
release-binary verification.

> [Commands](../../AGENTS.md#commands) - repository command policy and quality gates

## Key Resources

- [Contributing](../../CONTRIBUTING.md) - setup and daily contribution flow
- [AXM CI image](../../containers/ci/README.md) - public, source-free image
  contract, publication, and rollback policy
- [CI image workflow](../../.github/workflows/ci-image.yml) - build, validation,
  attestation, and publication
- [AgentXM images on GHCR](https://github.com/orgs/agentxm/packages) - versioned
  CI and development images
- [GitHub Actions CI](../../.github/workflows/ci.yml) - pinned image consumer

---

## Environment Model

| Need                        | Environment                             |
| --------------------------- | --------------------------------------- |
| Default Linux development   | `pnpm run container:dev`                |
| Native development          | `mise install`, then repository scripts |
| Reproduce required Linux CI | `pnpm run container:ci`                 |
| Platform-specific behavior  | Native GitHub runner                    |

The images contain tools only. Source, Git metadata, dependencies,
credentials, and user state enter at runtime. The wrapper mounts the current
worktree and Git common directory at their existing absolute paths. CI uses an
ephemeral home and anonymous root `node_modules` volume; Docker removes both
with the CI container. Its pnpm and Nx stores default to scoped Docker volumes.
An absolute `AXM_CI_PNPM_CACHE_VOLUME` or `AXM_CI_NX_CACHE_VOLUME` override is
instead treated as a bind mount; hosted PR verification uses this to restore
the stores independently through GitHub Actions. Development uses the
`axm-dev-home` identity volume and a checksum-suffixed dependency volume for the
current worktree. The image entrypoint maps its non-root user to the host
UID/GID, keeping Linux bind mounts writable while preventing container installs
from replacing native-platform packages in the host `node_modules`. Both modes
set a 65,536 file-descriptor limit for parallel test reliability across Docker
Desktop and Linux runners. They default Nx to two concurrent project tasks;
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

---

## Container Use

Docker-only bootstrap commands do not require a host Node installation:

```bash
scripts/container-environment.sh shell
scripts/container-environment.sh ci
scripts/container-environment.sh smoke
```

Once the native toolchain is active, the equivalent aliases are
`pnpm run container:dev`, `pnpm run container:ci`, and
`pnpm run container:smoke`. Override `AXM_CI_IMAGE` or `AXM_DEV_IMAGE` only to
test an intentional image upgrade. Set `AXM_DEV_DEPS_VOLUME` only when a stable,
operator-chosen dependency-volume name is preferable to the per-worktree
default.

The repository-owned CI image is public and must remain anonymously pullable.
The shared development image is private; for workstation or VM use,
authenticate Docker with a personal token that can read packages before running
a development-container command.

The development image may mount the Docker socket. Socket access is equivalent
to authority over the host Docker engine; use it only on a trusted workstation
or disposable development VM. Public and fork PR code runs on ephemeral
GitHub-hosted runners, never a persistent self-hosted runner.

To discard container-installed dependencies, list
`axm-dev-deps-<worktree-checksum>` volumes with `docker volume ls` and remove the
selected inactive worktree volume. This does not modify native `node_modules`.
Remove `axm-dev-home` separately only when persisted CLI identity should be
revoked.

### Container Checklist

- [ ] **Docker available** -- The host or VM Docker engine is running
- [ ] **Smoke green** -- `scripts/container-environment.sh smoke` passes
- [ ] **Normal commands used** -- Work inside the image through repository
      `pnpm` scripts
- [ ] **Dependencies isolated** -- Container package payloads use the Docker
      dependency volume rather than native `node_modules`
- [ ] **Socket trusted** -- Docker socket mounts occur only on trusted or
      disposable development substrates
- [ ] **Volume removable** -- Remove `axm-dev-home` to revoke persisted CLI
      identity

---

## Image Upgrade

AXM owns `ghcr.io/agentxm/axm-ci` in `containers/ci`. Change its inputs with an
immutable `VERSION` bump, then run `pnpm run container:smoke:ci-image` and full
`pnpm run ci`. The image workflow builds amd64 and arm64 artifacts once,
smoke-tests and scans those exact artifacts, publishes SBOM and provenance
attestations, and verifies anonymous pullability before recording the manifest
digest. Only after publication and soak should the required-CI workflow and
wrapper defaults move together to the new `<version>@sha256:<digest>` reference.
The previous digest remains the immediate rollback target.

The interactive development image remains an external AgentXM-owned contract;
its upgrade follows the same pin, smoke, and rollback discipline but is not
published by this repository.

### Upgrade Checklist

- [ ] **Toolchain matches** -- Node, pnpm, and Bun match `mise.toml`
- [ ] **Both architectures pass** -- amd64 and arm64 build, smoke, and scan
- [ ] **Publication verified** -- Public metadata, anonymous pull, SBOM, and
      provenance checks pass
- [ ] **Consumer defaults match** -- Required CI workflow and wrapper use one
      immutable reference
- [ ] **Workflow pin matches** -- Required Linux CI uses the tested release
- [ ] **Full CI green** -- `pnpm run ci` completes inside the new image
- [ ] **Rollback available** -- The prior semantic tag remains documented in
      Git history and pullable
