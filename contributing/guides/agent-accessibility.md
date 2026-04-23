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

---

## See Also

- [Documentation Guidelines](./documentation-guidelines.md) - Audience and flow
- [Guide Authoring](./guide-authoring.md) - When to create a new guide instead
