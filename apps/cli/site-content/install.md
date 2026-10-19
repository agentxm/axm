# Install AXM

## Before the first AXM command

Disclose telemetry before invoking AXM, including `axm --version`: by default
AXM collects command usage, public skill installs, and errors. Surface the
preference and carry any chosen override through subsequent commands:
`AXM_TELEMETRY=1` for all collection, `AXM_TELEMETRY=errors` for errors only,
or `AXM_TELEMETRY=0` for off. A nonempty `DO_NOT_TRACK` or `DISABLE_TELEMETRY`
overrides that choice and turns collection off. Preserve those overrides.

Set the chosen value in the shell used for every subsequent AXM command
(`export AXM_TELEMETRY=errors` in POSIX shells, or
`$env:AXM_TELEMETRY = "errors"` in PowerShell, for example). This uses the
existing environment controls; setup does not save a separate consent setting.
A conversation choice or export lasts only for the process or shell session
that receives it. For future shells, put the export in the profile those shells
actually load; on Windows, configure the user's environment explicitly. For a
coding agent, configure its actual launcher or start it from that configured
shell, for example `AXM_TELEMETRY=0 <agent-launcher>`. A GUI launcher may not
read shell profiles. Do not edit profiles or host permissions automatically.

Installer-owned version probes always receive `AXM_TELEMETRY=0` without changing
the environment used by later AXM operations. For a pipe, an assignment on the
downloader applies only to the downloader: `AXM_TELEMETRY=0 curl ... | sh` does
not configure `sh`. Export the choice first, or set it on the interpreter side.

**DONE WHEN:** `axm --version` succeeds and (if the user chose workspace
setup) `axm setup` has completed.

## Flow

1. Probe for existing install → upgrade or install.
2. Verify `axm --version`.
3. Preview setup, summarize its exact agent and file candidate, and get the
   user's approval.
4. Apply the approved candidate with explicit scope and agent flags.
5. Verify setup and stop. If continuing with extension work, load the installed
   AXM entry skill and only the help needed for that operation.

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

### Select the installer

Honor an explicitly requested method or the environment's established tool
policy. Otherwise use the install script. Do not install or survey package
managers merely to choose an installer. The script manages its executable through
`axm upgrade`; Homebrew and npm keep their own installation ownership.

Homebrew and npm alternatives are listed below. If a manager install fails,
diagnose its failure or use the standalone script with the user's existing
installation ownership in view.

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

Use project evidence when it names the intended agents. In an empty project,
name the requesting agent explicitly when it is known from the request or host,
for example `--agent claude-code`; otherwise ask once which agents to configure.
Workstation detections are unselected suggestions for project setup, not project
membership. Do not infer the requesting host from an arbitrary environment marker.

Choose instruction management with `--instructions <source-file|off>`.
The default is enabled with `AGENTS.md`; `off` leaves instruction files alone.
With no content yet, enabled setup records that intent without creating an empty
source or aliases. The first real source content or eligible Rule/Knowledge
contribution materializes the required files. Existing usable content propagates
normally; the plan discloses the canonical file, aliases, and any migration of
an existing file into the source. A differing unrelated alias blocks setup.

First preview the selected candidate without writing:

```bash
axm setup --preview --scope project --agent claude-code --instructions AGENTS.md --json --non-interactive
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
after setup is valid. Include instruction choice, concrete source and alias paths,
seed source/destination and replacement mechanism, retained files, warnings, and
blockers from this actual plan in the summary. A blocked preview is a successful
read-only assessment, not permission to apply. Resolve blockers or agent choices
before asking for approval of that exact candidate.

After approval, repeat every `result.agents[*].id` as an explicit `--agent`
flag, carry the same resolved `--instructions` choice, and apply without prompts.
Use the suggested Apply setup command when available. Carry
`--replace-unrecorded` only if the caller explicitly supplied that authority;
`--yes` does not grant it. For example:

```bash
axm setup --yes --scope project --agent claude-code --instructions AGENTS.md --non-interactive
```

Do not infer approval from a preview. An unattended first setup without
`--yes`, an explicit `--scope`, and at least one explicit `--agent` returns
`reason: "approval-required"` and writes nothing.

After setup, verify `axm lint --json` and
`axm sync --preview --fail-on-change --json`. Stop when installation and the
approved setup are verified. No compulsory help reading follows setup. If the
user continues with AXM work, load
`agent_extensions/registry.agentxm.ai/@agentxm/skills/axm/src/SKILL.md` and
follow its task routes. The bundled official skill is executable-supplied content,
not a user-authored package or a bare-publish candidate.

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
