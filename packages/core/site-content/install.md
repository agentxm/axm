# Install axm

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
- [ ] If not signed in: ask the user to choose between signing in to
      AgentXM.ai or going directly to workspace setup
- [ ] If the user chose to sign in: hand off signup/login, then re-check
      `axm whoami`
- [ ] Run `axm setup --yes` to initialize the project workspace

---

## What is axm

axm is the open extension manager for AI coding agents. It lets you discover,
install, publish, and manage skills, commands, subagents, MCP servers, and
extension packs across your AI agents from a single CLI. axm is the CLI;
[AgentXM.ai](https://agentxm.ai) is the extension registry it connects to —
accounts, publishing, and extension discovery live there. An AgentXM.ai
account is only required for publishing extensions or installing private
extensions; public extensions install without an account.

## Detect existing install

Before installing, check whether axm is already on the machine:

```bash
axm --version
```

- **Succeeds** (prints `X.Y.Z`) → axm is installed. Upgrade it to the latest
  version and skip the Install section:

  ```bash
  axm upgrade
  ```

  `axm upgrade` auto-detects how axm was installed. For script installs it
  downloads and swaps the binary in place. For Homebrew or npm installs it
  prints the exact command to run (`brew upgrade agentxm/tap/axm` or
  `npm update -g axm.sh`) — run whichever it emits, then re-run
  `axm --version`. Continue to **Verify** when done.

- **Fails** with `command not found` → axm is not installed. Continue to
  **Install**.
- **Fails** with any other error → treat as not installed and reinstall via
  the Install section.

## Choose install method

axm can be installed via a standalone binary script, Homebrew, or npm. Pick
based on what's already on the machine — don't install a new package manager
just to install axm.

### 1. Detect available package managers

Check which package managers are installed. A manager is "available" if the
`--version` command exits successfully.

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

All three options install the same axm binary. **The main difference is how
you'll update it later.** Frame the choice that way when asking.

**STOP HERE AND ASK THE USER:**

> Multiple install methods are available on this machine. The main
> difference is how you'll update axm later — pick the update path that
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
>    global npm packages. Choose this if axm is part of a Node.js-heavy
>    environment. Requires Node.js.

Wait for the user's response before continuing. Then run the corresponding
option below.

## Install

Each option below installs a persistent `axm` binary on the machine. Run the
option selected in **Choose install method**.

### Option A: macOS / Linux (install script)

```bash
curl -fsSL https://axm.sh/install.sh | sh
```

Installs to `~/.axm/bin/axm`. If `axm` is not found after install, add to PATH:

```bash
export PATH="$HOME/.axm/bin:$PATH"
```

### Option B: Windows (PowerShell)

```powershell
irm https://axm.sh/install.ps1 | iex
```

Installs to `%LOCALAPPDATA%\axm\axm.exe`. Follow the printed PATH instructions
if `axm` is not recognized.

### Option C: Windows (CMD)

```cmd
curl -fsSL -o install.cmd https://axm.sh/install.cmd && install.cmd
```

Installs to `%LOCALAPPDATA%\axm\axm.exe`. Follow the printed PATH instructions
if `axm` is not recognized.

### Option D: Homebrew (macOS / Linux)

```bash
brew install agentxm/tap/axm
```

### Option E: npm (any OS with Node.js)

Installs the `axm.sh` package globally. Requires Node.js.

```bash
npm install -g axm.sh
```

If `axm` is not found after install, ensure the npm global bin directory is on
PATH:

```bash
export PATH="$(npm config get prefix)/bin:$PATH"
```

## Verify

```bash
axm --version
# Expected: X.Y.Z
```

---

EXECUTE NOW: Run `axm --version`. If it succeeds, run `axm upgrade`. If it
fails, detect available package managers per **Choose install method**, ask
the user if more than one is available, and run the chosen installer. Stop
when `axm --version` succeeds, then proceed to **Check sign-in state**.

---

## Check sign-in state

axm is installed. Before continuing, detect whether this machine is already
signed in to AgentXM.ai — the result decides whether to ask the user about
signing in or skip straight to workspace setup.

```bash
axm whoami --json
```

- **Exit 0 with an identity** → already signed in. Skip to **Workspace setup**.
- **Exit non-zero** (for example, error code `AUTH_LOGIN_REQUIRED`) → not
  signed in. Continue to **Ask the user what to do next**.

## Ask the user what to do next

This machine is not signed in to AgentXM.ai.

Before asking, tell the user why the choice matters: signing in is only
needed to publish extensions or install private extensions, so the workspace
can still be set up without it. The choice is about whether to do that
sign-in now or defer it.

**STOP HERE AND ASK THE USER:**

> axm is installed. Before setting up the project workspace, would you like
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

AgentXM.ai is the extension registry that axm connects to. Accounts live on
AgentXM.ai, not in the CLI — `axm login` signs this machine in to an
AgentXM.ai account.

### If the user does not have an AgentXM.ai account

You cannot create an account for the user. Hand off:

1. Tell the user to open https://agentxm.ai/signup and create an account —
   explain that this sets up the AgentXM.ai account that `axm login` will
   later authenticate against, and that axm can't create the account
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
  flow; axm can't run it on their behalf because the browser step requires
  them to be present.
- **Non-interactive:** ask the user to export `AXM_TOKEN` in the
  environment where axm will run. Explain that `AXM_TOKEN` is a
  pre-generated credential that skips the browser step; you must not
  paste a token the user has not shared with you.

Wait for the user to confirm sign-in is complete. Tell them you're about to
re-run `axm whoami --json` to verify the sign-in succeeded before moving
on:

```bash
axm whoami --json
```

If it returns an identity, continue to **Workspace setup**. If not, the
sign-in did not complete — explain which check failed and ask the user to
retry the same path or switch paths.

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

Once it succeeds, consult the installed `@agentxm/skills/axm` skill for
day-to-day operations — workspace scenarios (greenfield, brownfield,
unmanaged skills), extension management, and publishing.

## Invariants

- **Explain why you're asking.** Whenever you need the user's consent, input,
  or out-of-band action — picking an install method, running `axm login`,
  opening a signup URL, approving a command you'd otherwise run yourself —
  state the purpose first: what you're about to do, why it's needed for
  this install, and what the user should do next. No yes/no prompts without
  context; no command handoffs without explaining the effect.
- **Never** run `axm login` without explicit user consent. The device flow
  opens a browser and requires the user to be present. When requesting
  consent, tell the user that `axm login` will open a browser, complete an
  OAuth device flow with AgentXM.ai, and store a local token so axm can
  talk to the registry on their behalf.
- **Never** set or paste an `AXM_TOKEN` the user has not shared. If the
  user is providing a token, explain that it authenticates the CLI against
  the user's AgentXM.ai account for the current shell session.
- **Always** re-run `axm whoami` after any user-driven sign-in step before
  running `axm setup`. Tell the user you're verifying the sign-in succeeded
  before moving on.
- **Resume, do not restart.** If the user completes sign-in out-of-band and
  returns, skip to **Workspace setup** — do not re-ask which option they
  picked.

---

## Troubleshooting

**`axm: command not found`**

The fix depends on how you installed:

- **Install script (macOS/Linux):** Add `~/.axm/bin` to PATH:
  ```bash
  export PATH="$HOME/.axm/bin:$PATH"
  ```
  Add the line above to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.) to
  persist across sessions.
- **Install script (Windows):** Add `%LOCALAPPDATA%\axm` to your PATH via
  System Environment Variables, or run:
  ```powershell
  $env:Path = "$env:LOCALAPPDATA\axm;$env:Path"
  ```
- **Homebrew:** Run `brew link axm` or check `brew --prefix axm`.
- **npm:** Ensure the global npm bin directory is on PATH:
  ```bash
  export PATH="$(npm config get prefix)/bin:$PATH"
  ```
