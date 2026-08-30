---
status: active
description: Choosing AXM's native development environment and repository-owned Linux CI
  verification environment.
depends-on:
  - ../../CONTRIBUTING.md
  - ../../AGENTS.md
---

# Development Environment

AXM uses native development with `mise.toml` as the repository tool-version
authority. Its repository-owned CI image reproduces required Linux verification
with the same `pnpm` and Nx commands. The image does not replace native macOS,
Windows, or release-binary verification.

> [Commands](../../AGENTS.md#commands) - repository command policy and quality gates

## Key Resources

- [Contributing](../../CONTRIBUTING.md) - setup and daily contribution flow
- [AXM CI image](../../containers/ci/README.md) - public, source-free image
  contract, publication, and rollback policy
- [CI image workflow](../../.github/workflows/ci-image.yml) - build, validation,
  attestation, and publication
- [AgentXM images on GHCR](https://github.com/orgs/agentxm/packages) - versioned
  CI images
- [GitHub Actions CI](../../.github/workflows/ci.yml) - pinned image consumer

---

## Environment Model

| Need                        | Environment                             |
| --------------------------- | --------------------------------------- |
| Interactive development     | `mise install`, then repository scripts |
| Reproduce required Linux CI | `pnpm run container:ci`                 |
| Platform-specific behavior  | Native GitHub runner                    |

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

### Native Windows verification

Required CI runs the bounded `Windows workspace lifecycle` job on
`windows-latest` for pull requests, main pushes, and manual CI dispatches. It
uses the repository toolchain setup and these Nx targets:

```powershell
pnpm nx run core:test-windows --outputStyle=static
pnpm nx run cli-e2e:e2e-windows --outputStyle=static
```

The core target exercises instruction-file managed copies on the native
Windows filesystem. The CLI target uses a workspace and user home whose paths
contain spaces, then covers agent detection, project and user setup, skill and
MCP lifecycle mutations, sync preview and apply, machine output, native
JSON/JSONC/TOML/YAML writers, lock refresh, and transactional recovery from an
injected filesystem failure. Both suites assert that they are running on
Windows; they never convert a substrate mismatch into a skip.

The job has a 25-minute ceiling and one Vitest worker per target. It uploads
only the two JUnit files under `test-results/*-windows/` for diagnosis, so the
artifact cannot capture process environments or workspace configuration
values.

---

## Run the source CLI against another workspace

Use a location-independent source entrypoint with AXM's directory selector when
the CLI checkout and target workspace differ:

```bash
/path/to/axm/scripts/axm-local -C /path/to/workspace setup --yes
bun /path/to/axm/packages/cli/src/main.ts -C /path/to/workspace list
```

Both entrypoints preserve the caller's working directory. `-C` / `--directory`
then selects the workspace before runtime initialization, and relative command
arguments resolve from that directory.

These path forms are the one supported exception to invoking `axm:local` by its
published name, recorded in the
[Command execution policy](../../docs/guides/command-execution-policy.md#named-exceptions):
outside the checkout there is no `pnpm` that resolves the name against AXM's
`package.json`. Inside the checkout, use `pnpm run axm:local -C <workspace>`.

Do not rely on `pnpm --dir /path/to/axm exec|run` to preserve the target: pnpm
changes into the AXM checkout before starting the command. If that invocation
form is necessary, pass `-C /path/to/workspace` explicitly.

If a mistaken invocation modifies the AXM source checkout, inspect and recover
that checkout with Git (`git -C /path/to/axm status` and a path-scoped
`git restore`). Do not run `axm adopt`; adoption changes extension authority and
does not restore repository files.

---

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
[Command execution policy](../../docs/guides/command-execution-policy.md); do
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
