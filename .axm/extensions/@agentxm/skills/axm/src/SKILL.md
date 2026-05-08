---
name: axm
description: |
  For managing (creating/install/update/editing/publish/enable/disable) agent skills, subagents, and commands. Always consult for anything involving agent skills, subagents, or slash commands in this workspace.
---

# AXM

## Agent Invariants

- **Read `axm help basic-usage` before doing anything.** Once per session,
  before any `axm` mutation or read, run `axm help basic-usage` and load the
  output. It is the pre-req knowledge that is not in any single `--help`
  page: workspace layout, key files (`.axm/settings.json`, `axm-lock.yaml`,
  `.axm/extensions/`), the commit policy (`.axm/` and `axm-lock.yaml` must
  be checked in, not gitignored), and safe-action rules. If the workspace
  has no `.axm/` directory yet, also load `axm help getting-started`.

- **Detect once at session start.** Probe `axm --version` once when the skill
  activates. If present, use `axm <command>` for the session. If missing,
  stop and direct the user to `https://axm.sh/install.md` for the install
  bootstrap. Do not attempt per-command runner fallbacks (`bunx`, `pnpx`,
  `npx`) — they fragment state across cached and installed versions and skip
  `axm setup`. For "always-latest," run `axm upgrade` once at the top of the
  session, not per command.

- **Probe commands exit 0.** `axm --version` and `axm whoami --json` have
  expected non-zero exit paths that are part of the decision logic, not
  failures. Wrap them so the shell exits 0 on every branch and branch on
  stdout, not exit code.

  POSIX:

  ```bash
  command -v axm >/dev/null 2>&1 && axm --version || echo "NOT_INSTALLED"
  axm whoami --json 2>/dev/null || echo '{"type":"error","code":"AUTH_LOGIN_REQUIRED"}'
  ```

  PowerShell:

  ```powershell
  if (Get-Command axm -ErrorAction SilentlyContinue) { axm --version } else { "NOT_INSTALLED" }
  try { axm whoami --json } catch { '{"type":"error","code":"AUTH_LOGIN_REQUIRED"}' }
  ```

- **Use `--json` for data commands.** Parse structured output, not
  human-readable text. The CLI auto-detects non-TTY and outputs JSON, but be
  explicit.

- **Use `--yes` for non-interactive confirmations.** Never let a prompt
  block in an automated workflow. Combine with `--preview` first if you
  need to inspect what will happen.

- **Scope awareness.** Extensions live at project scope
  (`.axm/settings.json` in the current directory) or user scope
  (`$AXM_USER_HOME/.axm` or `~/.axm`). Verify which scope is appropriate
  before install or uninstall.

- **Preview before destructive actions.** Use `--preview` before
  `uninstall`, `unpack`, `prune`, or any `--force` operation to show the
  agent and the user what will change.

- **Parse exit codes and error JSON.** Exit code `0` = success or clean
  cancellation. `1` = expected failure. `2` = unexpected defect. JSON
  errors include `type: "error"`, an `AREA_REASON` `code`, a human-readable
  `message`, and often `details`, `howToFix`, and `exitCode`. Use the code
  for programmatic recovery.

- **Auth invariants.** Never run `axm auth login` without explicit user
  consent. Never set an `AXM_TOKEN` the user hasn't shared. After any
  user-driven sign-in step, re-run the `axm whoami --json` probe wrapper to
  verify before proceeding.

## Primary Surfaces

- **`axm <command> --help`** — source of truth for command syntax, flags,
  and examples. Run before invoking an unfamiliar command.
- **`axm help <topic>`** — source of truth for pre-req knowledge and
  high-judgment workflows that don't fit per-command help:
  - `axm help basic-usage` — required reading before any AXM work in a
    session: workspace layout, key files, commit policy, safe-action rules.
  - `axm help getting-started` — first-time setup for workspaces that have
    never used AXM.
  - `axm help exit-codes` — process exit codes and JSON error shape.

  Run `axm help` (no args) to see the full topic index.
