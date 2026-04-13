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

The recommended method for AI coding agents to install axm autonomously.

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
axm auth login
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
axm auth login
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
npx axm.sh auth login
npx axm.sh whoami
```

---

## Authentication

After installing axm through any method, you need to authenticate.

### Interactive (recommended for local development)

```bash
axm auth login
```

Opens a browser for OAuth device code authorization. Grant access when prompted.

Verify authentication:

```bash
axm whoami
# Expected: displays your handle and account
```

### Non-interactive (CI, scripts, agents)

Set the `AXM_TOKEN` environment variable with a pre-provisioned token:

```bash
export AXM_TOKEN=<your-token>
```

If you have already completed an interactive login in another session, you can extract a reusable token:

```bash
export AXM_TOKEN=$(axm auth token)
```

---

## Troubleshooting

### `axm: command not found`

The axm binary is not on your PATH. The fix depends on how you installed it.

**Native Install (macOS/Linux):**

```bash
export PATH="$HOME/.axm/bin:$PATH"
```

Add this line to your shell profile (`~/.bashrc`, `~/.zshrc`, or `~/.profile`) to make it permanent.

**Native Install (Windows PowerShell):**

```powershell
$env:Path = "$env:LOCALAPPDATA\axm;" + $env:Path
```

To make it permanent, add `%LOCALAPPDATA%\axm` to your system PATH via Settings > System > Environment Variables.

**Native Install (Windows CMD):**

```cmd
set PATH=%LOCALAPPDATA%\axm;%PATH%
```

To make it permanent, add `%LOCALAPPDATA%\axm` to your system PATH via Settings > System > Environment Variables.

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
axm auth login
# Or for non-interactive environments:
export AXM_TOKEN=<your-token>
```

**Wrong account:**

```bash
axm auth logout && axm auth login
```

**Token expired:**

Tokens may expire. Re-authenticate:

```bash
axm auth login
# Or refresh the token:
export AXM_TOKEN=$(axm auth token)
```
