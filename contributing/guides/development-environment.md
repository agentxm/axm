---
status: active
last-reviewed: 2026-07-15
version: 0.1.0
description: Choosing and using AXM's native or shared-container development and Linux CI
  environment.
depends-on:
  - ../../CONTRIBUTING.md
  - ../../AGENTS.md
---

# Development Environment

AXM supports a shared Linux image and native development. The image is
the documented default for Linux feature work and CI reproduction. Both modes
use `mise.toml` as the repository tool-version authority and the same `pnpm`/Nx
commands. The image does not replace native macOS, Windows, or release-binary
verification.

> [Commands](../../AGENTS.md#commands) - repository command policy and quality gates

## Key Resources

- [Contributing](../../CONTRIBUTING.md) - setup and daily contribution flow
- [AgentXM images on GHCR](https://github.com/orgs/agentxm/packages) - private,
  versioned CI and development images
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
with the CI container. Development uses the `axm-dev-home` identity volume and a
checksum-suffixed dependency volume for the current worktree. The image
entrypoint maps its non-root user to the host UID/GID, keeping Linux bind mounts
writable while preventing container installs from replacing native-platform
packages in the host `node_modules`. Both modes set a 65,536 file-descriptor
limit for parallel test reliability across Docker Desktop and Linux runners.
They also default Nx to two concurrent project tasks; use
`AXM_CONTAINER_NX_PARALLEL` or `AXM_CONTAINER_VITEST_MAX_WORKERS` to make an
intentional substrate-specific override.

### Environment Checklist

- [ ] **Task branch** -- Start from a non-`main` branch or task worktree
- [ ] **Image pinned** -- Required CI uses the documented semantic image tag
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

GitHub Actions authenticates with its repository-scoped token. For workstation
or VM use, authenticate Docker with a personal token that can read packages
before running a container command.

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

The image is an external versioned contract. Upgrade the workflow pin and wrapper
defaults together, run the smoke command against the new immutable version, run
full `pnpm run ci`, and retain the previous version for rollback. Image build,
publication, SBOM, and vulnerability-scan ownership is outside this repository.

### Upgrade Checklist

- [ ] **Toolchain matches** -- Node, pnpm, and Bun match `mise.toml`
- [ ] **Wrapper defaults match** -- CI and development defaults use one release
- [ ] **Workflow pin matches** -- Required Linux CI uses the tested release
- [ ] **Full CI green** -- `pnpm run ci` completes inside the new image
- [ ] **Rollback available** -- The prior semantic tag remains documented in
      Git history and pullable
