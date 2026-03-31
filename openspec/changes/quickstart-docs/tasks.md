> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Bash Install Script (`install.sh`)

> **Subagent:** Run this entire phase in a single subagent.

Rewrite the existing `install.sh` to download standalone binaries from GitHub Releases instead of using npm. No Node.js dependency.

- [x] 1.1 Rewrite `install.sh` — detect OS (macOS/Linux) and architecture (x64/arm64), download the correct binary from `https://github.com/agentxm/axm/releases/latest/download/axm-{platform}-{arch}` using curl (with wget fallback), place at `~/.axm/bin/axm`, `chmod +x`, verify with `axm --version`. Print PATH setup instructions if `~/.axm/bin` is not on PATH. Exit with clear error on unsupported platform, missing download tool, or failed download. Must work via `curl -fsSL https://axm.sh/install.sh | sh`.
- [x] 1.2 Verify — run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, fix any failures
- [x] 1.3 Kill any vitest worker processes

## 2. PowerShell Install Script (`install.ps1`)

> **Subagent:** Run this entire phase in a single subagent.

New script for Windows. Downloads standalone binary, no Node.js dependency.

- [x] 2.1 Create `install.ps1` — detect architecture (x64 supported, arm64 unsupported with clear error), download `axm-windows-x64.exe` from GitHub Releases via `Invoke-WebRequest`, place at `$env:LOCALAPPDATA\axm\axm.exe`, create directory if needed, verify with `axm --version`. Print PATH instructions if not on PATH. Must work via `irm https://axm.sh/install.ps1 | iex`.
- [x] 2.2 Verify — run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, fix any failures
- [x] 2.3 Kill any vitest worker processes

## 3. Windows CMD Install Script (`install.cmd`)

> **Subagent:** Run this entire phase in a single subagent.

New batch script for Windows users without PowerShell. Downloads standalone binary using curl (Windows 10+).

- [x] 3.1 Create `install.cmd` — download `axm-windows-x64.exe` from GitHub Releases using `curl` (error if curl not found, suggest PowerShell alternative), place at `%LOCALAPPDATA%\axm\axm.exe`, create directory if needed, verify with `axm --version`. Print PATH instructions if not on PATH via `where axm`. No PowerShell, Node.js, or third-party tools required.
- [x] 3.2 Verify — run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, fix any failures
- [x] 3.3 Kill any vitest worker processes

## 4. Agent Install Doc (`INSTALL.md`)

> **Subagent:** Run this entire phase in a single subagent.

Update the existing `INSTALL.md` to document all non-agent installation pathways.

- [x] 4.1 Rewrite `INSTALL.md` — retain TODO-checklist format and "DONE WHEN" criteria (`axm --version && axm whoami`). Present `npx @axm.sh/cli` as the primary/default install method (agents typically have Node.js). Document native install scripts (bash, PowerShell, CMD) and Homebrew as alternatives for environments without Node.js. Include both interactive (`axm auth login`) and non-interactive (`AXM_TOKEN` env var / `axm auth token`) authentication. Include troubleshooting for `axm: command not found`, auth errors, and registry connectivity.
- [x] 4.2 Verify — run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, fix any failures
- [x] 4.3 Kill any vitest worker processes

## 5. Quickstart Documentation (`docs/quickstart.md`)

> **Subagent:** Run this entire phase in a single subagent.

New quickstart markdown content for the axm.sh website. Consumed by a separate website repo.

- [x] 5.1 Create `docs/quickstart.md` — present four pathways: Agent (link to `axm.sh/install.md`), Native Install (bash/PowerShell/CMD one-liners), Homebrew (`brew install axm-sh/tap/axm`), and npx (`npx @axm.sh/cli`, requires Node.js). Each pathway includes complete instructions through verification (`axm --version`, `axm auth login`). Include authentication section (interactive and non-interactive). Include troubleshooting section (PATH issues per platform, auth errors).
- [x] 5.2 Verify — run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`, fix any failures
- [x] 5.3 Kill any vitest worker processes

## 6. Homebrew Formula (`agentxm/homebrew-tap`)

> **Subagent:** Run this entire phase in a single subagent.

Update the formula in the `agentxm/homebrew-tap` repo to download standalone binaries from `github.com/agentxm/axm` releases.

- [ ] 6.1 Update Homebrew formula — download prebuilt binary from `github.com/agentxm/axm` releases per platform/arch (darwin-arm64, darwin-x64, linux-x64, linux-arm64). No Node.js dependency. Include correct metadata (name, description, homepage `https://axm.sh`, license). Include `test` block running `axm --version`. Support `brew install axm-sh/tap/axm` shorthand and explicit `brew tap` + `brew install`. Support upgrade and uninstall.
- [ ] 6.2 Verify — `brew audit --strict` and `brew test` pass (if local Homebrew testing is feasible)

> **Parallelization:** Phases 1, 2, 3 are independent — launch as parallel subagents. Phase 4 and 5 are independent of each other and of 1-3 — launch as parallel subagents. Phase 6 is independent of all other phases — can run in parallel with any phase.
