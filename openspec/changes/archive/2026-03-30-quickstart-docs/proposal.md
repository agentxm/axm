## Why

New users and AI agents need a clear, fast path from "never heard of axm" to a working installation. Today, the only documented method is `npm install -g` (in `INSTALL.md` for agents and `install.sh` for bash). The publicly accessible axm.sh website needs quickstart content that covers all major platforms and installation preferences — including native scripts for Windows, package managers (Homebrew), and a dedicated agent-oriented pathway — so every user can get started in under a minute regardless of their environment.

## What Changes

- Add quickstart documentation content for the axm.sh website with four installation pathways:
  1. **Agent pathway** — machine-readable install instructions (`install.md`) served at `axm.sh/install.md`, designed for AI agents to consume and execute autonomously
  2. **Native install scripts** — platform-specific one-liner scripts:
     - Bash: `curl -fsSL https://axm.sh/install.sh | sh` (already exists, needs rewrite for binary distribution)
     - PowerShell: `irm https://axm.sh/install.ps1 | iex` (new)
     - Windows CMD: downloadable `install.cmd` (new)
  3. **Homebrew** — `brew install axm-sh/tap/axm` via the `agentxm/homebrew-tap` repo
  4. **npx** — `npx @axm.sh/cli` for Node.js users (zero-install)
- Create quickstart markdown content (consumed by a separate website repo for axm.sh) that presents all pathways with clear guidance on which to use
- Update `INSTALL.md` (agent install doc) to document all installation pathways (minus the agent pathway itself)
- Rewrite `install.sh` to download a standalone binary instead of using npm
- Install scripts and Homebrew distribute standalone binaries — no Node.js dependency
- Standalone binary compilation (`bun build --compile`) and CI pipeline changes are **out of scope** — handled by a separate `standalone-binary-distribution` change. This change assumes binaries will be available at known GitHub Release URLs.

## Capabilities

### New Capabilities

- `quickstart-website-content`: Quickstart markdown content (for axm.sh website) — pathway selection, installation instructions, authentication, and verification steps for all methods
- `install-script-bash`: Bash install script (`install.sh`) rewrite — downloads standalone binary, detects platform/arch, no Node.js dependency
- `install-script-powershell`: PowerShell install script (`install.ps1`) for Windows — downloads standalone binary, no Node.js dependency
- `install-script-cmd`: Windows CMD install script (`install.cmd`) — downloads standalone binary, no Node.js dependency
- `install-homebrew`: Homebrew formula in the `agentxm/homebrew-tap` repo for macOS/Linux installation via `brew install`
- `install-agent-doc`: Updated `INSTALL.md` agent install doc — documents all non-agent installation pathways with step-by-step instructions

### Modified Capabilities

- (none — existing `INSTALL.md` and `install.sh` are not currently spec'd capabilities)

## Impact

- **Documentation**: New quickstart markdown content in this repo, consumed by the axm.sh website repo
- **Agent doc**: `INSTALL.md` updated to cover all installation methods
- **Install scripts**: `install.sh` rewritten, new `install.ps1` and `install.cmd` — all download standalone binaries from `github.com/agentxm/axm` releases
- **Homebrew**: `agentxm/homebrew-tap` formula updated to point to releases from this repo
- **Repo visibility**: This repo (`agentxm/axm`) is now public
- **No website infrastructure changes** — a separate repo handles hosting and rendering
- **No build pipeline changes** — standalone binary compilation is a separate change
