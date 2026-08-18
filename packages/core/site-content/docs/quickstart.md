---
title: Quickstart
description: Get axm installed, authenticated, and ready to use
---

# Quickstart

Get axm installed, authenticated, and ready to use. Pick the installation method that fits your environment, then follow the steps through verification.

## Choose Your Installation Method

| Method                            | Platforms             | Node.js Required | Best For                                            |
| --------------------------------- | --------------------- | ---------------- | --------------------------------------------------- |
| [Agent](#agent)                   | Any                   | Varies           | AI coding agents installing axm autonomously        |
| [Native Install](#native-install) | macOS, Linux, Windows | No               | Most users — standalone binary, nothing else needed |
| [Homebrew](#homebrew)             | macOS, Linux          | No               | Homebrew users who prefer `brew upgrade`            |
| [npx](#npx)                       | Any                   | Yes              | Trying axm without a global install                 |

---

## Agent

The recommended method for AI coding agents to install AXM autonomously.

Point your agent to the machine-readable install document:

```
https://axm.sh/install.md
```

This document contains step-by-step instructions in a TODO-checklist format that agents can parse and execute. It covers installation, authentication, and verification.

---

## Native Install

Downloads a standalone binary. No Node.js dependency.

### macOS and Linux (bash)

```bash
curl -fsSL https://axm.sh/install.sh | sh
```

### Windows (PowerShell)

```powershell
irm https://axm.sh/install.ps1 | iex
```

### Windows (CMD)

Download and run the install script directly:

```cmd
curl -fsSL -o install.cmd https://axm.sh/install.cmd && install.cmd
```

### Verify

```bash
axm --version
```

You should see output like `X.Y.Z`.

### Authenticate

```bash
axm login
```

This opens a browser for OAuth authorization. Grant access when prompted, then verify:

```bash
axm whoami
```

---

## Homebrew

Available on macOS and Linux. No Node.js dependency.

### Install

```bash
brew install axm-sh/tap/axm
```

### Verify

```bash
axm --version
```

### Authenticate

```bash
axm login
```

This opens a browser for OAuth authorization. Grant access when prompted, then verify:

```bash
axm whoami
```

---

## npx

Zero-install option for Node.js users. Good for trying axm without committing to a global install. Requires Node.js.

### Run

```bash
npx axm.sh
```

You can pass any axm command directly:

```bash
npx axm.sh --version
npx axm.sh login
npx axm.sh whoami
```

---

## Authentication

After installing axm through any method, you need to authenticate.

### Interactive (recommended for local development)

```bash
axm login
```

Opens a browser for AgentXM.ai authorization. Grant access when prompted.
On desktop systems this uses a local loopback callback with PKCE. In SSH, CI,
Codespaces, or `--device-code` mode, AXM displays a five-minute device code and
opens the static verification page.

Verify authentication:

```bash
axm whoami
# Expected: displays your handle and account
```

### Non-interactive (CI, scripts, agents)

Store a pre-provisioned token in a restrictive, readable file and provide its
path to AXM:

```bash
export AXM_TOKEN_FILE=/path/to/axm-token
```

`AXM_TOKEN` remains supported, but a token file is less likely to leak through
process environments. Run `axm help environment` for credential precedence and
the complete automation contract. Never print a token into logs.

---

## Troubleshooting

### `axm: command not found`

The axm binary is not on your PATH. The fix depends on how you installed it.

**Native Install (macOS/Linux):**

```bash
export PATH="$HOME/.axm/bin:$PATH"
```

Add this line to your shell profile (`~/.profile`, `~/.bashrc`, or `~/.zshrc`), then open a new terminal.

**Native Install (Windows PowerShell):**

```powershell
$env:Path = "$env:USERPROFILE\.axm\bin;" + $env:Path
```

To make it permanent, add `%USERPROFILE%\.axm\bin` to your User PATH via Settings > System > Environment Variables, then open a new terminal.

**Native Install (Windows CMD):**

```cmd
set "PATH=%USERPROFILE%\.axm\bin;%PATH%"
```

To make it permanent, add `%USERPROFILE%\.axm\bin` to your User PATH via Settings > System > Environment Variables, then open a new terminal.

The native installer prints these commands using the resolved install
directory, including custom paths, plus an absolute command for verifying the
installed executable. Automation and non-interactive shells may not load
profile changes, so set PATH explicitly or use that absolute path.

**Homebrew:**

Homebrew should handle PATH automatically. If not, ensure your Homebrew bin directory is on PATH:

```bash
eval "$(brew shellenv)"
```

**npx:**

If `npx` itself is not found, ensure Node.js is installed and its bin directory is on PATH:

```bash
export PATH="$(npm config get prefix)/bin:$PATH"
```

### Authentication errors

**`AUTH_LOGIN_REQUIRED` or "Not authenticated":**

```bash
axm login
# Or for non-interactive environments:
export AXM_TOKEN_FILE=/path/to/axm-token
```

**Wrong account:**

```bash
axm logout && axm login
```

**Token expired:**

Tokens may expire. Re-authenticate:

```bash
axm login
# Or refresh the token:
export AXM_TOKEN_FILE=/path/to/refreshed-axm-token
```
