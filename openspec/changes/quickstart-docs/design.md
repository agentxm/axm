## Context

axm currently has two installation artifacts: `INSTALL.md` (step-by-step for agents) and `install.sh` (bash one-liner). Both assume npm is available and only target Unix-like systems. The CLI is built as a TypeScript project compiled to JS and distributed via npm as `@axm.sh/cli` — it requires Node.js at runtime.

This repo needs quickstart documentation content and install scripts that a separate website repo (axm.sh) will consume and host. This change produces markdown content and scripts only — no website infrastructure or build pipeline changes.

Existing state:

- `install.sh` — bash script that checks for Node/npm, runs `npm install -g @axm.sh/cli`, verifies PATH
- `INSTALL.md` — agent-consumable install instructions (markdown with TODO checklist)
- Build pipeline: TypeScript → JS via `@nx/js:tsc`, published to npm
- No standalone binary compilation (separate change)
- No Windows-native install scripts
- No Homebrew formula
- This repo (`agentxm/axm`) is now public — GitHub Release assets are downloadable without authentication
- `agentxm/homebrew-tap` exists but needs to point to releases from this repo

## Goals / Non-Goals

**Goals:**

- Produce quickstart markdown content and install scripts in this repo for the axm.sh website to consume
- Cover macOS, Linux, and Windows with native installation experiences
- Provide an agent-optimized pathway (machine-readable markdown)
- Document Homebrew as an installation channel
- **No Node.js dependency** for install scripts and Homebrew — scripts download standalone binaries
- Provide `npx @axm.sh/cli` as a zero-install pathway for users who already have Node.js
- All pathways converge on the same post-install experience: `axm --version` then `axm auth login`

**Non-Goals:**

- Website infrastructure, hosting, rendering, or deployment — a separate repo handles that
- Standalone binary compilation (`bun build --compile`) and CI pipeline — separate change
- Auto-update mechanisms — install scripts are one-shot
- Winget support (deferred)
- Windows arm64 binary support (Bun compile limitation — can add later)
- Version pinning in install scripts — scripts always install latest
- Supporting package managers beyond Homebrew (e.g., apt, yum, snap, Chocolatey)
- Offline installation or air-gapped environments

## Decisions

### 1. Releases published from this repo (agentxm/axm)

Standalone binaries are published as GitHub Release assets on this repo (`github.com/agentxm/axm`), which is now public. Install scripts and the Homebrew formula download from: `https://github.com/agentxm/axm/releases/latest/download/axm-{platform}-{arch}`.

The actual binary compilation (`bun build --compile`) and CI pipeline changes are a separate `standalone-binary-distribution` change. This change authors the content and scripts that consume those releases.

**Rationale:** Centralizing releases in the main repo keeps versioning simple and avoids a separate releases repo.

### 2. Install scripts download prebuilt binaries

Each install script (`install.sh`, `install.ps1`, `install.cmd`) detects the platform/architecture, downloads the appropriate binary from GitHub Releases, and places it on PATH. No Node.js or npm required.

**Flow:** detect OS/arch → download binary → place in install directory → verify `axm --version`

**Install locations:**

- Unix: `~/.axm/bin/axm` — user-local, no sudo required, PATH setup via shell rc file (matches Rust/rustup, Deno, Bun convention)
- Windows: `%LOCALAPPDATA%\axm\axm.exe` (with PATH instructions)

**Alternatives considered:**

- (a) npm install in scripts (current `install.sh`) — rejected: requires Node.js
- (b) Download + extract tarball — rejected: unnecessary layer; single binary is simpler

**Rationale:** Downloading a single binary is the simplest possible install experience. No package manager, no runtime, no extraction.

### 3. Install scripts are self-contained single files

Each install script (`install.sh`, `install.ps1`, `install.cmd`) is a single file with no external dependencies beyond the platform's native tooling (curl/wget on Unix, Invoke-WebRequest on Windows).

**Rationale:** One-liner install commands (`curl | sh`, `irm | iex`) are the industry standard for CLI tools. Single files are easy to audit, cache, and serve.

### 4. Content lives in this repo as markdown files

Quickstart documentation is authored as `docs/quickstart.md` in this repo. A separate website repo consumes this content for rendering on axm.sh. This repo is not responsible for hosting, rendering, or deployment.

**Alternatives considered:**

- (a) CMS-managed content — rejected: adds external dependency, harder to review/version
- (b) Author directly in website repo — rejected: install scripts and docs should live near the CLI they describe

**Rationale:** Co-locating content with install scripts ensures they stay in sync. The website repo pulls from this repo as its source of truth.

### 5. Homebrew distribution via a tap at agentxm/homebrew-tap

axm will be distributed via a Homebrew tap hosted at `github.com/agentxm/homebrew-tap`. The formula downloads the prebuilt standalone binary for the user's platform from `github.com/agentxm/axm` releases — no Node.js dependency. The existing `agentxm/homebrew-tap` repo needs to be updated to point to release assets from this repo.

**Alternatives considered:**

- (a) Submit to homebrew-core — rejected for now: requires significant install base and review process
- (b) Homebrew cask — rejected: casks are for GUI apps, not CLI tools
- (c) Formula that depends on Node.js and npm-installs — rejected: contradicts no-Node.js goal

**Rationale:** A tap gives full control over the formula, faster iteration, and no gatekeeper. Binary distribution means zero runtime dependencies. Migration to homebrew-core can happen later when adoption warrants it.

### 6. Agent pathway — install.md documents all non-agent pathways

The agent install document (`INSTALL.md`, served at `axm.sh/install.md`) is updated to document all installation pathways except the agent pathway itself (no self-reference). This includes native install scripts, Homebrew, and npx. The document retains its TODO-checklist format for agents to parse and execute step-by-step.

**Rationale:** Agents benefit from knowing all available install methods. The `npx` path is the default recommendation (agents typically have Node.js), with install scripts and Homebrew as alternatives.

### 7. npx as a first-class quickstart pathway

The quickstart content includes `npx @axm.sh/cli` as a pathway for Node.js users who want to try axm without installing. This is the existing npm package — no new build work required.

**Rationale:** `npx` is zero-friction for the large Node.js user base. It complements standalone binaries rather than competing with them.

## Risks / Trade-offs

- **Dependency on standalone binary change** — Install scripts and Homebrew formula won't work until binaries are published to GitHub Releases. → Mitigation: Scripts can be authored and reviewed now; tested once binaries land. Clear dependency documented.
- **PowerShell execution policy** — Windows may block `.ps1` scripts by default. → Mitigation: Document `Set-ExecutionPolicy` or provide the CMD alternative.
- **Homebrew tap discovery** — Users must know the tap name. → Mitigation: Quickstart content shows `brew install axm-sh/tap/axm` shorthand.
- **URL stability** — Changing install script URLs breaks existing documentation and agent configs. → Mitigation: Commit to `axm.sh/install.sh`, `axm.sh/install.ps1`, `axm.sh/install.cmd`, `axm.sh/install.md` as permanent URLs.
