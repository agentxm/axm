# Install AXM

**DONE WHEN:** `axm --version` succeeds and (if the user chose workspace setup)
`axm setup` has completed.

---

## TODO

- [ ] Detect existing install (`axm --version`)
- [ ] If installed: `axm upgrade`. Otherwise: detect available package
      managers (brew, npm) and pick the install method
- [ ] If multiple install methods are available: ask the user which to use
- [ ] Run the chosen installer
- [ ] Verify `axm --version`
- [ ] Check sign-in state with `axm whoami --json`
- [ ] If not signed in: ask the user to sign in to AgentXM.ai or proceed
      to workspace setup; on the sign-in choice, hand off signup/login and
      re-check `axm whoami`
- [ ] Run `axm setup --yes` to initialize the project workspace
- [ ] Load pre-req help topics: `axm help getting-started` and
      `axm help basic-usage`

---

## What is AXM

AXM (Agent eXtension Manager) is the open extension manager for AI coding
agents — discover, install, publish, and manage skills, commands, subagents,
MCP servers, and extension packs from a single CLI.
[AgentXM.ai](https://agentxm.ai) is the extension registry AXM connects to.
An AgentXM.ai account is only required for publishing extensions or
installing private extensions; public extensions install without an account.

## Detect existing install

Check whether AXM is already on the machine. This is a **probe** — invoke
it so the shell exits 0 on either branch and the signal lives in stdout
(see **Probe commands** under Invariants):

On macOS / Linux:

```bash
command -v axm >/dev/null 2>&1 && axm --version || echo "NOT_INSTALLED"
```

On Windows (PowerShell):

```powershell
if (Get-Command axm -ErrorAction SilentlyContinue) { axm --version } else { "NOT_INSTALLED" }
```

Branch on the output:

- **Prints `X.Y.Z`** → AXM is installed. Upgrade and skip the Install section:

  ```bash
  axm upgrade
  ```

  `axm upgrade` auto-detects the install method and either swaps the binary
  in place (script installs) or prints the right `brew`/`npm` command to
  run. If it prints a command, run it and re-run the probe above. Continue
  to **Verify** when done.

- **Prints `NOT_INSTALLED`** → AXM is not installed. Continue to **Install**.
- **Prints anything else** → treat as not installed and reinstall via the
  Install section.

## Choose install method

AXM can be installed via a standalone binary script, Homebrew, or npm. Pick
based on what's already on the machine — don't install a new package manager
just to install AXM.

### 1. Detect available package managers

A manager is "available" if `--version` exits successfully.

On macOS / Linux:

```bash
brew --version >/dev/null 2>&1 && echo "brew: available"
npm --version >/dev/null 2>&1 && echo "npm: available"
```

On Windows (PowerShell):

```powershell
if (Get-Command brew -ErrorAction SilentlyContinue) { "brew: available" }
if (Get-Command npm  -ErrorAction SilentlyContinue) { "npm: available"  }
```

### 2. Pick the method

Use this decision table — same logic on every platform:

| Detected managers              | Chosen method                                                 |
| ------------------------------ | ------------------------------------------------------------- |
| Neither                        | Install script (Option A on macOS/Linux, Option B on Windows) |
| Homebrew only                  | Homebrew (Option D)                                           |
| npm only                       | npm (Option E)                                                |
| Homebrew and npm (two or more) | **STOP AND ASK** the user — see the prompt below              |

The install script is always a valid fallback. If a package-manager install
fails, retry with Option A or B.

### 3. Ask the user when multiple managers are available

All three options install the same `axm` binary. **The main difference is how
you'll update it later.** Frame the choice that way when asking.

**STOP HERE AND ASK THE USER:**

> Multiple install methods are available on this machine. The main
> difference is how you'll update AXM later — pick the update path that
> matches how you manage other tools.
>
> 1. **Install script** (recommended) — Updates via `axm upgrade`
>    (self-managed, independent of any package manager). Standalone binary
>    installed to `~/.axm/bin` (macOS/Linux) or `%LOCALAPPDATA%\axm`
>    (Windows). No extra tools required.
> 2. **Homebrew** — Updates via `brew upgrade agentxm/tap/axm`, alongside
>    your other brew packages. Choose this if you already manage most CLIs
>    with brew.
> 3. **npm** — Updates via `npm update -g axm.sh`, alongside your other
>    global npm packages. Choose this if AXM is part of a Node.js-heavy
>    environment. Requires Node.js.

Wait for the user's response before continuing. Then run the corresponding
option below.

## Install

Each option below installs a persistent `axm` binary on the machine. Run the
option selected in **Choose install method**.

If `axm` is not found after any install option, see **Troubleshooting**.

### Option A: macOS / Linux (install script)

```bash
curl -fsSL https://axm.sh/install.sh | sh
```

Installs to `~/.axm/bin/axm`.

### Option B: Windows (PowerShell)

```powershell
irm https://axm.sh/install.ps1 | iex
```

Installs to `%LOCALAPPDATA%\axm\axm.exe`.

### Option C: Windows (CMD)

```cmd
curl -fsSL -o install.cmd https://axm.sh/install.cmd && install.cmd
```

Installs to `%LOCALAPPDATA%\axm\axm.exe`.

### Option D: Homebrew (macOS / Linux)

```bash
brew install agentxm/tap/axm
```

### Option E: npm (any OS with Node.js)

Requires Node.js. Installs the `axm.sh` package globally.

```bash
npm install -g axm.sh
```

## Verify

```bash
axm --version
# Expected: X.Y.Z
```

---

EXECUTE NOW: Run the probe from **Detect existing install** (not bare
`axm --version` — see **Probe commands** under Invariants). If the output
is `X.Y.Z`, run `axm upgrade`. If the output is `NOT_INSTALLED`, detect
available package managers per **Choose install method**, ask the user if
more than one is available, and run the chosen installer. Stop when the
probe prints `X.Y.Z`, then proceed to **Check sign-in state**.

---

## Check sign-in state

Detect whether this machine is signed in to AgentXM.ai — the result decides
whether to ask the user about signing in or skip to workspace setup. Like
**Detect existing install**, this is a **probe** — invoke it so the shell
exits 0 on either branch and the signal lives in stdout:

On macOS / Linux:

```bash
axm whoami --json 2>/dev/null || echo '{"type":"error","code":"AUTH_LOGIN_REQUIRED"}'
```

On Windows (PowerShell):

```powershell
try { axm whoami --json } catch { '{"type":"error","code":"AUTH_LOGIN_REQUIRED"}' }
```

Branch on the JSON `type` field in stdout:

- **`type` is not `"error"`** (identity payload) → already signed in. Skip
  to **Workspace setup**.
- **`type` is `"error"`** (typically with `code` = `AUTH_LOGIN_REQUIRED`) →
  not signed in. Continue to **Ask the user what to do next**.

## Ask the user what to do next

This machine is not signed in to AgentXM.ai.

Before asking, tell the user why the choice matters: signing in is only
needed to publish extensions or install private extensions, so the workspace
can still be set up without it. The choice is about whether to do that
sign-in now or defer it.

**Do not run `axm login`, `axm setup`, or any other signed-in command
until the user has explicitly chosen one of the two options below.**

**STOP HERE AND ASK THE USER:**

> AXM is installed. Before setting up the project workspace, would you like
> to sign in to AgentXM.ai? Signing in is only needed if you plan to
> publish extensions or install private extensions — public extensions
> install without an account.
>
> 1. **Sign up or log in to AgentXM.ai** (recommended if you plan to
>    publish extensions or install private extensions)
> 2. **Proceed to setting up your project workspace** (you can sign in
>    later with `axm login`)

Wait for the user's response before continuing.

- **Option 1** → continue with **Sign up or log in to AgentXM.ai** below,
  then **Workspace setup**.
- **Option 2** → skip to **Workspace setup**.

---

## Sign up or log in to AgentXM.ai

`axm login` signs this machine in to an AgentXM.ai account.

### If the user does not have an AgentXM.ai account

You cannot create an account for the user. Hand off:

1. Tell the user to open https://agentxm.ai/signup and create an account —
   explain that this sets up the AgentXM.ai account that `axm login` will
   later authenticate against, and that AXM can't create the account
   because signup happens through the web.
2. Wait for the user to confirm signup is complete.
3. Continue to **Log in** below.

### Log in

Explain to the user what logging in will do before handing off: it proves
to AgentXM.ai that this machine belongs to their account, and stores a
local token so subsequent `axm` commands can reach the registry.

Offer both paths and let the user pick:

- **Interactive (recommended):** ask the user to run `axm login` in their
  terminal. Tell them this opens a browser for a one-time OAuth device
  flow; AXM can't run it on their behalf because the browser step requires
  them to be present.
- **Non-interactive:** ask the user to export `AXM_TOKEN` in the
  environment where AXM will run. Explain that `AXM_TOKEN` is a
  pre-generated credential that skips the browser step; you must not
  paste a token the user has not shared with you.

Wait for the user to confirm sign-in is complete, then re-run the probe
wrapper from **Check sign-in state** to verify before moving on. If `type`
is not `"error"`, continue to **Workspace setup**. If `type` is `"error"`,
the sign-in did not complete — ask the user to retry the same path or
switch paths.

---

## Workspace setup

Before running the command, tell the user what it will do to their project:
create `.axm/` configuration files, install default extensions (including
`@agentxm/skills/axm`), and register agent discovery symlinks in the
current working directory.

Run:

```bash
axm setup --yes
```

Once it succeeds, load the two pre-req help topics before doing any other
AXM work in this session — they cover what `axm setup` produced and the
files an agent must understand before changing workspace state:

```bash
axm help getting-started
axm help basic-usage
```

`getting-started` covers first-time setup of a workspace; read it so the
agent understands how the workspace was just initialized. `basic-usage`
covers the key workspace files (`.axm/settings.json`, `axm-lock.yaml`,
`.axm/extensions/`), the commit policy (`.axm/` and `axm-lock.yaml` must
be checked in, not gitignored), and how to act safely in an existing
workspace.

After reading both topics, consult the installed `@agentxm/skills/axm`
skill for day-to-day operations — workspace scenarios (greenfield,
brownfield, unmanaged skills), extension management, and publishing.

## Invariants

- **Probe commands exit 0.** `axm --version` and `axm whoami --json` have
  expected non-zero exit paths ("not installed", "not signed in") that are
  part of the flow, not failures. Always invoke them using the wrappers in
  **Detect existing install** and **Check sign-in state**; branch on
  stdout, not the exit code.
- **Explain why you're asking.** Every stop-and-ask, command handoff, and
  consent request states what the action does, why it's needed, and what
  the user should do next. Bare yes/no prompts and bare command handoffs
  are non-conforming.
- **Guide sign-in, do not execute sign-in.** Never run `axm login` without
  explicit user consent; never set or paste an `AXM_TOKEN` the user has
  not shared. The device flow requires the user's browser; the token is
  the user's credential.
- **Always** re-run the `axm whoami --json` probe after any user-driven
  sign-in step before running `axm setup`.
- **Option 2 is legitimate, not a fallback.** If the user chose to defer
  sign-in, do not re-prompt later in the flow. Signing in is deferred,
  not required.
- **Resume, do not restart.** If the user completes sign-in out-of-band and
  returns, skip to **Workspace setup** — do not re-ask which option they
  picked.

---

## Troubleshooting

**`axm: command not found`** — the install bin directory is not on PATH:

- **Install script (macOS/Linux):** `export PATH="$HOME/.axm/bin:$PATH"`,
  then add to `~/.bashrc` / `~/.zshrc` to persist.
- **Install script (Windows):** Add `%LOCALAPPDATA%\axm` to PATH via
  System Environment Variables, or run
  `$env:Path = "$env:LOCALAPPDATA\axm;$env:Path"`.
- **Homebrew:** `brew link axm`.
- **npm:** `export PATH="$(npm config get prefix)/bin:$PATH"`.
