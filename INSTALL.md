# Install axm

**DONE WHEN:** `axm --version && axm whoami` both succeed.

---

## TODO

- [ ] Install axm CLI
- [ ] Authenticate
- [ ] Verify

---

## What is axm

axm is the open extension manager for AI coding agents. It lets you search,
install, publish, and manage skills, commands, MCP servers, and extension packs
across all your AI agents from a single CLI.

## Step 1: Install

```bash
npm install -g @axm.sh/cli
```

**Verify:**

```bash
axm --version
# Expected: axm version X.Y.Z
```

If `axm: command not found`, ensure your global npm bin directory is on PATH:

```bash
export PATH="$(npm config get prefix)/bin:$PATH"
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
axm skills list --output-format json
```

## Troubleshooting

**`axm: command not found`**

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
# Or point to a local registry for development:
export AXM_REGISTRY_URL=http://localhost:4300
```
