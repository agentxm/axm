# Agent Accessibility Guide

How to keep the repo's install and skill-facing docs aligned with actual
behavior. Use this guide when changing CLI commands, flags, install flows,
output, or reusable skills.

## Key Resources

- [Instructions Guide](./instructions.md) - Ownership of instruction artifacts
- [install.md](../../install.md) - User-shared, agent-executed install entry
  point

---

## What Counts as an Agent Accessibility Artifact

In this repo, the main artifacts are:

- `install.md` for setup and first-run verification
- `AGENTS.md` and `CLAUDE.md` for repo-wide operating rules
- `SKILL.md` files for reusable workflows

If a change affects what a contributor or agent can successfully do, one of
these files may need an update.

---

## Update Triggers

Review the relevant artifacts when any of these change:

- a CLI command or flag is added, removed, or renamed
- install prerequisites or setup steps change
- first-run verification commands change
- output format or error behavior changes in a way docs promise
- a skill workflow, trigger, or file layout changes

---

## Verification Workflow

Do not document from memory.

1. Run the actual command or workflow.
2. Update the owning document.
3. If the same instruction exists in more than one place, diff the copies.
4. Keep examples short enough to paste and run.

For `install.md`, prefer a clean-shell or clean-workspace validation when the
install path changes.

For skills, keep the canonical `SKILL.md` in the skill's owning directory. If a
skill is mirrored into another namespace such as `.claude/` and `.codex/`,
keep the copies byte-for-byte aligned or make the canonical source explicit.

---

## Quality Bar

- Commands are valid against the current repo
- Examples use current flag names and expected output shape
- Doc scope matches the artifact: install in `install.md`, repo policy in
  `AGENTS.md` or `CLAUDE.md`, bounded workflow in `SKILL.md`
- No internal-only repo references or private operational details leak in
- Probe commands (commands with expected non-zero exit paths, e.g.,
  `axm --version` when not installed, `axm whoami --json` when signed out)
  are wrapped so the shell exits 0 on every expected branch and the signal
  lives in stdout. Branch on output, not exit code. See **Probe commands** in
  `install.md`'s Invariants for the canonical wrappers.

---

## Probe Commands

Agent harnesses (Claude Code, Cursor, OpenCode, etc.) surface any non-zero
exit as a red tool-call error panel. For real failures that's right; for
expected probe branches in our install flow it's jarring and misleading —
the user sees an error block for a command that completed its job.

Agent-facing artifacts (`install.md`, `SKILL.md`, anything the agent copies
into a shell) must wrap probes so they always exit 0 and put the decision
signal in stdout. The current probes:

| Probe            | POSIX wrapper                                                                             | Expected stdout values                                                           |
| ---------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Install presence | `command -v axm >/dev/null 2>&1 && axm --version \|\| echo "NOT_INSTALLED"`               | `X.Y.Z` (installed) or `NOT_INSTALLED`                                           |
| Sign-in state    | `axm whoami --json 2>/dev/null \|\| echo '{"type":"error","code":"AUTH_LOGIN_REQUIRED"}'` | Identity JSON (signed in) or `{"type":"error","code":"AUTH_LOGIN_REQUIRED",...}` |

PowerShell variants appear alongside POSIX in `install.md`.

This is a documentation convention, not a CLI change — the CLI still returns
meaningful exit codes for scripting and CI contexts. The convention applies
only to agent-facing artifacts where a non-zero exit during an expected
branch is a UX problem.

---

## See Also

- [Documentation Guidelines](./documentation-guidelines.md) - Audience and flow
- [Guide Authoring](./guide-authoring.md) - When to create a new guide instead
