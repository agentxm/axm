# Install & Distribution: Next Steps Plan

Phased plan for standalone binary distribution, cross-platform CI, and Homebrew automation.

**Current state:** npm distribution plus standalone binary compilation, CI now validates/lints/typechecks separately, compiles release binaries on Ubuntu, uploads binary artifacts, and runs cross-platform smoke tests. Release publication now reuses those CI binaries for `cli-v{VERSION}` GitHub Releases, uploads them as release assets, publishes both npm packages with provenance, includes a Homebrew tap update hook when `HOMEBREW_TAP_TOKEN` is configured, and runs non-blocking post-release install verification jobs. First-release SHA replacement and live release verification are still pending.

**Target state:** Standalone binaries for 4 platforms, cross-platform E2E, automated Homebrew formula updates.

---

## Phase 1: Standalone Binary Compilation

Set up `bun build --compile` to produce self-contained executables from the CLI package.

- [x] 1.1 Add a `compile` target to `packages/cli/project.json` that runs `bun build --compile` against the built JS entry point (`dist/src/main.js`)
- [x] 1.2 Produce binaries for all 4 platform/arch targets:
  - `axm-darwin-arm64`
  - `axm-darwin-x64`
  - `axm-linux-arm64`
  - `axm-linux-x64`
  - `axm-windows-x64.exe`
- [x] 1.3 Verify compiled binaries run `axm --version` and `axm --help` correctly on the local platform
- [x] 1.4 Document the compile step in the CLI package README or CLAUDE.md (build prerequisites, output locations)

---

## Phase 2: CI Workflow — Build & Test

Update `.github/workflows/ci.yml` to include binary compilation and artifact storage.

### 2a. Normal CI (existing, verify current)

- [x] 2.1 Confirm existing CI runs: format check, lint, typecheck, build, test, e2e on every push/PR
- [x] 2.2 Ensure CI fails fast on lint/typecheck before running expensive build/test steps

### 2b. Compile Binaries & Store Artifacts

- [x] 2.3 Add a CI job that compiles standalone binaries for all 5 targets after build passes
  - Use `bun build --compile --target=bun-{platform}-{arch}` for cross-compilation
  - Run on Ubuntu (Bun supports cross-compilation from any host)
- [x] 2.4 Upload compiled binaries as workflow artifacts (`actions/upload-artifact`) with reasonable retention (e.g. 7 days for PRs, 90 days for main)
- [x] 2.5 Verify artifact names match what install scripts and Homebrew formula expect (`axm-{platform}-{arch}`)

### 2c. Cross-Platform Binary E2E / Smoke Tests

- [x] 2.6 Add a matrix job that downloads binary artifacts and runs smoke tests on each platform:
  - `ubuntu-latest` (linux-x64)
  - `ubuntu-24.04-arm` (linux-arm64) — or use QEMU if ARM runners unavailable
  - `macos-latest` (darwin-arm64)
  - `macos-15-intel` (darwin-x64)
  - `windows-latest` (windows-x64)
- [x] 2.7 Define binary smoke tests (in `packages/cli-e2e/`):
  - `axm --version` exits 0 and prints semver
  - `axm --help` exits 0 and prints usage
  - `axm auth token` exits non-zero with auth error (not a crash)
  - `axm skills disable fake-skill --yes --non-interactive` exits non-zero with a CLI error (not a crash)
- [x] 2.8 Ensure smoke tests run the binary directly (no `bun run`, no Node.js) — validates the standalone executable works
- [x] 2.9 Gate the release job on all platform smoke tests passing
  - Implemented by requiring a successful `CI` workflow run for the exact release commit before release assets are downloaded/uploaded

---

## Phase 3: Release Workflow

Automate versioned releases with binary assets and npm publish.

- [x] 3.1 Create `.github/workflows/release.yml` (or extend `publish.yml`) triggered on GitHub Release publication
- [x] 3.2 Release job downloads compiled binaries from the CI workflow artifacts (or re-compiles — prefer reusing artifacts from the same commit)
- [x] 3.3 Upload binaries as GitHub Release assets with correct names:
  - `axm-darwin-arm64`
  - `axm-darwin-x64`
  - `axm-linux-arm64`
  - `axm-linux-x64`
  - `axm-windows-x64.exe`
- [x] 3.4 Publish `@agentxm/client-core` and `axm.sh` to npm with provenance (existing publish.yml logic)
- [x] 3.5 Version strategy: Release tag format `cli-v{VERSION}` — install scripts and Homebrew formula depend on this
- [x] 3.6 Add a release checklist or script that validates all expected assets are present before upload/publish steps proceed

---

## Phase 4: Homebrew Formula Completion & Automation

Complete the remaining Homebrew formula work, then automate updates after each release.

### 4a. Complete Outstanding Quickstart-Docs Formula Tasks

- [x] 4.1 Update the formula in `agentxm/homebrew-tap` to download prebuilt binaries from `github.com/agentxm/axm` releases for:
  - `axm-darwin-arm64`
  - `axm-darwin-x64`
  - `axm-linux-arm64`
  - `axm-linux-x64`
- [x] 4.2 Ensure the formula includes the correct metadata (`name`, description, homepage `https://axm.sh`, license), a `test` block that runs `axm --version`, and supports:
  - `brew install agentxm/tap/axm`
  - explicit `brew tap` + `brew install`
  - upgrade and uninstall flows
- [ ] 4.3 Verify the formula with `brew audit --strict` and `brew test` (locally if feasible, otherwise on CI)
  - `brew audit --strict --tap agentxm/tap axm` passed locally
  - `brew test` is still blocked until the first real `cli-v{VERSION}` release exists with downloadable binaries

### 4b. Automate Formula Updates

- [x] 4.4 Add a post-release CI step that runs `scripts/update-homebrew-formula.sh` to update the homebrew-tap repo
- [ ] 4.5 Set up a deploy key or PAT secret (`HOMEBREW_TAP_TOKEN`) in the axm repo with push access to `agentxm/homebrew-tap`
- [x] 4.6 CI step: clone homebrew-tap, run the update script with the release version, push the commit
- [ ] 4.7 Remove `PLACEHOLDER` SHA256s from the formula once the first real release is published

---

## Phase 5: Install Script Verification

Ensure install scripts work end-to-end against real releases.

- [x] 5.1 Add an E2E test (manual or CI) that runs `install.sh` on a clean Linux and macOS environment and verifies `axm --version`
- [x] 5.2 Add an E2E test that runs `install.ps1` on a clean Windows environment and verifies `axm --version`
- [x] 5.3 Add an E2E test that runs `install.cmd` on a clean Windows environment and verifies `axm --version`
- [x] 5.4 Add an E2E test that runs `brew install agentxm/tap/axm` on macOS and verifies `axm --version`
- [x] 5.5 These can run as a post-release verification job (not blocking release, but alerting on failure)
  - Implemented as non-blocking `install-verify` and `brew-verify` jobs in the release workflow

---

## Workflow Summary

```
PR / Push to main
  ├─ Format check, lint, typecheck
  ├─ Build (TypeScript → JS)
  ├─ Unit tests + existing E2E tests
  ├─ Compile standalone binaries (cross-compile on Ubuntu)
  ├─ Upload binary artifacts
  └─ Cross-platform smoke tests (matrix: linux, macOS, Windows)
       ├─ linux-x64
       ├─ linux-arm64
       ├─ darwin-arm64
       ├─ darwin-x64
       └─ windows-x64

GitHub Release published (tag: cli-vX.Y.Z)
  ├─ Validate tag + package versions
  ├─ Download binaries from successful CI run for the tagged commit
  ├─ Upload as release assets
  ├─ Publish to npm (with provenance)
  ├─ Update Homebrew formula (SHA256s + version)
  └─ Post-release install script + Homebrew verification (non-blocking)
```

---

## Open Questions

- **ARM runners:** Resolved for CI smoke tests with `ubuntu-24.04-arm`. Revisit only if runner availability/capacity becomes a problem.
- **Windows arm64:** Currently unsupported (Bun compile limitation). Add when Bun supports it.
- **Release trigger:** Resolved to manual GitHub Release publication using a `cli-v{VERSION}` tag.
- **Binary signing:** Code signing for macOS (Gatekeeper) and Windows (SmartScreen) — needed for install scripts to work without security warnings?
