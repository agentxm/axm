# Install AXM

**DONE WHEN:** `axm --version` succeeds and (if the user chose workspace
setup) `axm setup` has completed.

## Flow

1. Probe for existing install → upgrade or install.
2. Verify `axm --version`.
3. Probe sign-in → ask the user → optionally hand off `axm login`.
4. Preview setup, summarize its exact agent and file candidate, and get the
   user's approval.
5. Apply the approved candidate with explicit scope and agent flags.
6. Read `.axm/extensions/@agentxm/skills/axm/src/SKILL.md`, then load
   `axm help getting-started` and `axm help basic-usage`.

## Invariants

- **Probes exit 0.** `axm --version` and `axm whoami --json` have expected
  non-zero exit paths ("not installed", "not signed in") that are part of
  the flow. Always invoke them via the wrappers below and branch on stdout,
  not the exit code.
- **Explain before asking.** Every stop-and-ask and command handoff states
  what it does, why it's needed, and what the user should do next. Bare
  yes/no prompts are non-conforming.
- **Guide sign-in, do not execute it.** Never run `axm login` without
  explicit consent; never paste an `AXM_TOKEN` the user has not shared.
- **Resume, do not restart.** If the user completes sign-in out-of-band,
  skip to **Workspace setup** — do not re-ask which option they picked.
- **Option 2 (defer sign-in) is legitimate, not a fallback.** Do not
  re-prompt later in the flow.

---

## 1. Detect existing install

```bash
# macOS / Linux
command -v axm >/dev/null 2>&1 && axm --version || echo "NOT_INSTALLED"
```

```powershell
# Windows (PowerShell)
if (Get-Command axm -ErrorAction SilentlyContinue) { axm --version } else { "NOT_INSTALLED" }
```

Branch on stdout:

- **`X.Y.Z`** → installed. Run `axm upgrade` (auto-detects the install
  method and upgrades script, Homebrew, and npm installs). Skip to **§3**.
- **`NOT_INSTALLED`** or anything else → continue to **§2**.

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
   ≥22.19.0. If `node --version` reports an older release, upgrade Node first
   or pick option 1 or 2 instead.

Wait for the user's choice before running an installer.

### Run the installer

| Option | Platform                  | Command                                                               |
| ------ | ------------------------- | --------------------------------------------------------------------- |
| A      | macOS / Linux             | `curl -fsSL https://axm.sh/install.sh \| sh`                          |
| B      | Windows (PS)              | `irm https://axm.sh/install.ps1 \| iex`                               |
| C      | Windows (CMD)             | `curl -fsSL -o install.cmd https://axm.sh/install.cmd && install.cmd` |
| D      | Homebrew                  | `brew install agentxm/tap/axm`                                        |
| E      | npm (any OS, Node ≥22.19) | `npm install -g axm.sh`                                               |

Install locations: `~/.axm/bin/axm` (script, macOS/Linux);
`%USERPROFILE%\.axm\bin\axm.exe` (script, Windows).

### Verify

Re-run the probe from **§1**. Expect `X.Y.Z`. If `axm` is not found, see
**Troubleshooting**.

---

## 3. Check sign-in state

```bash
# macOS / Linux
axm whoami --json 2>/dev/null || echo '{"type":"error","code":"AUTH_LOGIN_REQUIRED"}'
```

```powershell
# Windows (PowerShell)
try { axm whoami --json } catch { '{"type":"error","code":"AUTH_LOGIN_REQUIRED"}' }
```

Branch on the JSON `type` field:

- **Not `"error"`** (identity payload) → signed in. Skip to **§5**.
- **`"error"`** (typically `code` = `AUTH_LOGIN_REQUIRED`) → continue to **§4**.

## 4. Ask the user about sign-in

Tell the user _why_ the choice matters: signing in is only needed to publish
extensions or install private extensions; the workspace can still be set up
without it. Then ask them to pick:

1. **Sign up or log in to AgentXM.ai** (recommended if publishing or
   installing private extensions).
2. **Proceed to workspace setup** (can sign in later with `axm login`).

**Do not run `axm login`, `axm setup`, or any signed-in command until the
user has picked.** Wait for the response, then:

- Option 1 → continue with **Sign in** below, then **§5**.
- Option 2 → skip to **§5**.

### Sign in

If the user has no AgentXM.ai account, point them to
https://agentxm.ai/signup — explain that signup happens through the web and
AXM can't create the account on their behalf. Wait for confirmation, then
continue.

Before handing off `axm login`, explain what it does: it proves the machine
belongs to their account and stores a local token so subsequent `axm`
commands can reach the registry. Offer both paths:

- **Interactive (recommended):** ask the user to run `axm login` in their
  terminal. It opens a browser for a one-time authorization flow; AXM can't
  run it on their behalf because the browser step requires the user. In
  SSH/CI/Codespaces or with `--device-code`, AXM falls back to a five-minute
  device-code flow.
- **Non-interactive:** ask the user to place a pre-generated token in a
  restrictive, readable file and export `AXM_TOKEN_FILE` with that path in the
  environment where AXM will run. `AXM_TOKEN` remains supported but is easier
  to leak through process environments. Never paste or print a token the user
  has not shared with you. Run `axm help environment` for precedence and
  security details.

After the user confirms, re-run the probe from **§3**. If `type` is still
`"error"`, ask them to retry the same path or switch paths.

---

## 5. Workspace setup

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
candidate will create `.axm/` configuration, install default extensions
(including `@agentxm/skills/axm`), and register the listed agent artifacts.
Wait for approval of that exact agent set and scope.

After approval, repeat every `result.agents[*].id` as an explicit `--agent`
flag and apply without prompts. For example:

```bash
axm setup --yes --scope project --agent claude-code --non-interactive
cat .axm/extensions/@agentxm/skills/axm/src/SKILL.md
axm help getting-started
axm help basic-usage
```

Do not infer approval from a preview. An unattended first setup without
`--yes`, an explicit `--scope`, and at least one explicit `--agent` returns
`reason: "approval-required"` and writes nothing.

After setup, read the installed AXM skill and both help topics before doing
any other AXM work in this session:

- **`.axm/extensions/@agentxm/skills/axm/src/SKILL.md`** — agent rules for
  safe AXM CLI use, permissions, output modes, and day-to-day operations.

- **`getting-started`** — first-time workspace setup; explains what `axm
setup` just produced.
- **`basic-usage`** — the key workspace files (`.axm/settings.json`,
  `axm-lock.yaml`, `.axm/extensions/`), the commit policy (`.axm/` and
  `axm-lock.yaml` must be checked in, not gitignored), and how to act safely
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
