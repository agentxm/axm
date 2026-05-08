---
name: axm
description: |
  For managing (creating/install/update/editing/publish/enable/disable) agent skills, subagents, and commands. Always consult for anything involving agent skills, subagents, or slash commands in this workspace.
---

# AXM

## Agent Invariants

- **Load pre-reqs once per session.** Run `axm help basic-usage` before any
  `axm` read or mutation. If the workspace has no `.axm/` directory yet, also
  run `axm help getting-started`.

- **Detect once at session start.** Probe `axm --version`. If missing, stop
  and direct the user to `https://axm.sh/install.md`. Do not fall back to
  `bunx`/`pnpx`/`npx`. For "always-latest," run `axm upgrade` once at the
  top of the session.

- **Probe commands exit 0.** `axm --version` and `axm whoami --json` have
  expected non-zero paths that are part of the decision logic. Wrap so the
  shell exits 0 and branch on stdout, not exit code.

  ```bash
  command -v axm >/dev/null 2>&1 && axm --version || echo "NOT_INSTALLED"
  axm whoami --json 2>/dev/null || echo '{"type":"error","code":"AUTH_LOGIN_REQUIRED"}'
  ```

- **Use `--json` for data commands.** The CLI auto-detects non-TTY, but be
  explicit.

- **Use `--yes` for non-interactive confirmations.** Combine with `--preview`
  first when you need to inspect what will happen.

- **Verify scope before install/uninstall.** Project (`.axm/`) vs. user
  (`~/.axm`).

- **Preview before destructive actions.** Use `--preview` before
  `uninstall`, `unpack`, `prune`, or any `--force` operation.

- **On non-zero exit, parse the JSON `code` for recovery.** See
  `axm help exit-codes` for the table.

- **Auth.** Never run `axm auth login` or set `AXM_TOKEN` without explicit
  user consent. After any sign-in, re-run the `axm whoami --json` probe to
  verify.

## Primary Surfaces

- **`axm <command> --help`** — command syntax, flags, examples.
- **`axm help <topic>`** — pre-req knowledge and cross-cutting workflows.
  Run `axm help` (no args) for the topic index.
