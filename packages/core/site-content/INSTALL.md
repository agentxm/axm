# Install axm

**DONE WHEN:** `axm --version && axm whoami` both succeed.

---

## TODO

- [ ] Install axm CLI
- [ ] Authenticate
- [ ] Verify

---

## What is axm

axm is the open extension manager for AI coding agents. It lets you discover,
install, publish, and manage skills, commands, subagents, MCP servers, and
extension packs across your AI agents from a single CLI.

## Step 1: Install

Choose one installation method. Agents typically run in Node.js environments, so
npx is the recommended default.

### Option A: npx (recommended for agents)

Requires Node.js. No global install needed.

```bash
npx axm.sh --version
```

Prefix all axm commands with `npx axm.sh` instead of `axm`:

```bash
npx axm.sh auth login
npx axm.sh whoami
```

### Option B: Native install scripts

For environments without Node.js. Downloads a standalone binary.

**macOS / Linux (bash):**

```bash
curl -fsSL https://axm.sh/install.sh | sh
```

Installs to `~/.axm/bin/axm`. If `axm` is not found after install, add to PATH:

```bash
export PATH="$HOME/.axm/bin:$PATH"
```

**Windows (PowerShell):**

```powershell
irm https://axm.sh/install.ps1 | iex
```

Installs to `%LOCALAPPDATA%\axm\axm.exe`. Follow the printed PATH instructions
if `axm` is not recognized.

**Windows (CMD):**

Download and run `install.cmd` from `https://axm.sh/install.cmd`:

```cmd
curl -fsSL -o install.cmd https://axm.sh/install.cmd && install.cmd
```

Installs to `%LOCALAPPDATA%\axm\axm.exe`. Follow the printed PATH instructions
if `axm` is not recognized.

### Option C: Homebrew (macOS / Linux)

```bash
brew install agentxm/tap/axm
```

**Verify:**

```bash
axm --version
# Expected: X.Y.Z
```

## Step 2: Authenticate

### Non-interactive (agents, CI, scripts)

Set the `AXM_TOKEN` environment variable with a pre-provisioned token:

```bash
export AXM_TOKEN=<your-token>
```

If you have already completed an interactive login in another session, you can
extract a reusable token:

```bash
export AXM_TOKEN=$(axm auth token)
```

### Interactive (terminals with a browser)

```bash
axm auth login
```

Opens a browser for OAuth device code authorization. Grant access when prompted.

**Verify:**

```bash
axm whoami
# Expected: displays your handle and account
```

---

EXECUTE NOW: Start with Step 1. Mark TODO items complete as you go. Stop when
`axm --version && axm whoami` both succeed.

---

## Optional: Set Up a Project

**Do not execute this section unless explicitly requested.**

```bash
# Initialize axm in your project directory
axm init --non-interactive --yes

# Install a skill
axm skills install @acme/skills/code-review --yes --non-interactive

# See what's installed
axm skills list --json
```

## Troubleshooting

**`axm: command not found`**

The fix depends on how you installed:

- **npx:** Use `npx axm.sh` instead of `axm`. Ensure Node.js is installed.
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
- **npm (legacy):** Ensure your global npm bin directory is on PATH:
  ```bash
  export PATH="$(npm config get prefix)/bin:$PATH"
  ```

**Not authenticated / `AUTH_LOGIN_REQUIRED`**

```bash
axm auth login
# Or for non-interactive: export AXM_TOKEN=<token>
```

**Wrong account**

```bash
axm auth logout && axm auth login
```

**Registry unreachable**

```bash
# Check connectivity to the default registry
curl -sf https://registry.agentxm.ai/v1/health || echo "Registry unreachable"
# Or override the built-in default source for development/testing:
export AXM_REGISTRY_LOCATION=http://localhost:4300
# AXM_REGISTRY_LOCATION may also be a file path or file:// URL
```
