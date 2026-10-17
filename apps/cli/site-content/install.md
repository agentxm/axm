# Install AXM

**DONE WHEN:** `axm --version` succeeds and (if the user chose workspace
setup) `axm setup` has completed.

## Flow

1. Probe for existing install → upgrade or install.
2. Verify `axm --version`.
3. Preview setup, summarize its exact agent and file candidate, and get the
   user's approval.
4. Apply the approved candidate with explicit scope and agent flags.
5. Read `agent_extensions/registry.agentxm.ai/@agentxm/skills/axm/src/SKILL.md`, then load
   `axm help getting-started` and `axm help basic-usage`.

## Invariants

- **Explain before asking.** Every stop-and-ask and command handoff states
  what it does, why it's needed, and what the user should do next. Bare
  yes/no prompts are non-conforming.

---

## 1. Detect existing install

```bash
# macOS / Linux
if command -v axm >/dev/null 2>&1; then axm --version; else echo "NOT_INSTALLED"; fi
```

```powershell
# Windows (PowerShell)
if (Get-Command axm -ErrorAction SilentlyContinue) { axm --version } else { "NOT_INSTALLED" }
```

Branch on stdout:

- **`X.Y.Z`** → installed. Run `axm upgrade` (auto-detects the install
  method and upgrades script, Homebrew, and npm installs). Skip to **§3**.
- **`NOT_INSTALLED`** → continue to **§2**.
- **An installed executable fails** → diagnose that failure before reinstalling.

## 2. Install

### Choose the method

A manager is "available" if its `--version` exits 0 (`brew --version`,
`npm --version`; PowerShell: `Get-Command brew|npm`). Don't install a new
package manager just to install AXM.

| Detected          | Method                                          |
| ----------------- | ----------------------------------------------- |
| Neither           | Install script (A on macOS/Linux, B on Windows) |
| Homebrew only     | Homebrew (D)                                    |
| npm only          | npm (E)                                         |
| Both brew and npm | **Ask the user** (see below)                    |

The install script is always a valid fallback if a package-manager install
fails.

### Ask when multiple managers are available

All three install the same `axm` binary; **the difference is how you update
it later.** Frame the choice that way, then ask the user to pick one:

1. **Install script** (recommended) — self-managed via `axm upgrade`,
   independent of any package manager. Installs to `~/.axm/bin`
   (macOS/Linux) or `%USERPROFILE%\.axm\bin` (Windows).
2. **Homebrew** — `brew upgrade agentxm/tap/axm`, alongside other brew
   packages. Pick this if most CLIs are managed with brew.
3. **npm** — `npm install -g axm.sh`, alongside other global npm packages.
   Pick this if AXM is part of a Node.js-heavy environment. Requires Node.js
   as specified under **npm prerequisite** below.

Wait for the user's choice before running an installer.

### npm prerequisite

npm installation requires Node.js ≥24.21.0. If `node --version` reports an
older release, upgrade Node first or use a standalone installer. The install
scripts and Homebrew installation do not require Node.js.

### Run the installer

| Option | Platform                     | Command                                                               |
| ------ | ---------------------------- | --------------------------------------------------------------------- |
| A      | macOS / Linux                | `curl -fsSL https://axm.sh/install.sh \| sh`                          |
| B      | Windows (PS)                 | `irm https://axm.sh/install.ps1 \| iex`                               |
| C      | Windows (CMD)                | `curl -fsSL -o install.cmd https://axm.sh/install.cmd && install.cmd` |
| D      | Homebrew                     | `brew install agentxm/tap/axm`                                        |
| E      | npm (see prerequisite above) | `npm install -g axm.sh`                                               |

Install locations: `~/.axm/bin/axm` (script, macOS/Linux);
`%USERPROFILE%\.axm\bin\axm.exe` (script, Windows).

### Verify

Re-run the probe from **§1**. Expect `X.Y.Z`. If `axm` is not found, see
**Troubleshooting**.

---

## 3. Workspace setup

Public installation and local setup work while signed out. Sign in when you
need private extensions or publishing; `axm login --help` owns the available
sign-in flows. See `axm help machine-output` for automation's result and error
contracts.

First preview setup without writing:

```bash
axm setup --preview --scope project --json --non-interactive
```

Read `result.agents`, `result.agentCandidates`, `result.scopeSupport`, and
`result.steps`. Summarize the exact proposed agent set, file changes, and
category-by-category scope outcomes to the user, including which signals came
from the project and which came only from the workstation. Each scope outcome
is `supported`, `project-only`, `unsupported`, or `refused` and includes a
stable `reasonCode`. Never reinterpret a user-scope `project-only` or `refused`
outcome as permission to write project scope. Tell the user that applying the
candidate will create root `axm.json`, `axm.lock`, and `agent_extensions/`;
install default extensions
(including `@agentxm/skills/axm`), and register the listed agent artifacts.
In a Git-managed project, setup may also add AXM runtime and package-transaction
entries to `.gitignore`. It never edits `.gitattributes` or formatter
configuration; the consuming repository must exclude acquired
`agent_extensions/` content from mutating tools.
Successful setup and valid `axm.json` in the selected scope establish
initialization. Ignored `.axm/` runtime state is created on demand; its absence
after setup is valid. Wait for approval of that exact agent set and scope.

After approval, repeat every `result.agents[*].id` as an explicit `--agent`
flag and apply without prompts. For example:

```bash
axm setup --yes --scope project --agent claude-code --non-interactive
cat agent_extensions/registry.agentxm.ai/@agentxm/skills/axm/src/SKILL.md
axm help getting-started
axm help basic-usage
```

Do not infer approval from a preview. An unattended first setup without
`--yes`, an explicit `--scope`, and at least one explicit `--agent` returns
`reason: "approval-required"` and writes nothing.

After setup, read the installed AXM skill and both help topics before doing
any other AXM work in this session:

- **`agent_extensions/registry.agentxm.ai/@agentxm/skills/axm/src/SKILL.md`** — agent rules for
  safe AXM CLI use, permissions, output modes, and day-to-day operations.

- **`getting-started`** — first-time workspace setup; explains what `axm
setup` just produced.
- **`basic-usage`** — the key workspace files (`axm.json`, `axm.lock`,
  `agent_extensions/`), the commit policy (those paths are committed while
  `.axm/` is ignored), and how to act safely
  in an existing workspace.

---

## Troubleshooting

**`axm: command not found`** — install bin directory is not on PATH:

- **Script (macOS/Linux):** run `export PATH="$HOME/.axm/bin:$PATH"`; add the
  same export to `~/.profile`, `~/.bashrc`, or `~/.zshrc`, then open a new
  terminal.
- **Script (Windows PowerShell):** run
  `$env:Path = "$env:USERPROFILE\.axm\bin;" + $env:Path`; add
  `%USERPROFILE%\.axm\bin` to your User PATH, then open a new terminal.
- **Script (Windows Command Prompt):** run
  `set "PATH=%USERPROFILE%\.axm\bin;%PATH%"`; add
  `%USERPROFILE%\.axm\bin` to your User PATH, then open a new terminal.
- **Homebrew:** `brew link axm`.
- **npm:** `export PATH="$(npm config get prefix)/bin:$PATH"`.

The native installers print commands using the resolved install directory,
including custom directories. Automation and non-interactive shells may not
load profile changes, so set PATH explicitly or invoke the absolute executable
path printed by the installer.
