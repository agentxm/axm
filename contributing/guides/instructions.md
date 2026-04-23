# Instructions Guide

How to choose the right instruction artifact in this repo: `README.md`,
`CONTRIBUTING.md`, `AGENTS.md`, `CLAUDE.md`, `install.md`, and `SKILL.md`.
Use it when deciding where guidance should live and how narrowly it should be
scoped.

## Key Resources

- [Documentation Guidelines](./documentation-guidelines.md) - Shared writing
  rules
- [Agent Accessibility](./agent-accessibility.md) - Keeping install and skill
  docs in sync with reality

---

## Artifact Selection

| File              | Purpose                        | Typical content                                      |
| ----------------- | ------------------------------ | ---------------------------------------------------- |
| `README.md`       | Overview for humans and agents | what the directory is, structure, concepts           |
| `CONTRIBUTING.md` | Contributor workflow           | setup, verify, release, review expectations          |
| `AGENTS.md`       | Repo rules for coding agents   | constraints, patterns, commands, quality bar         |
| `CLAUDE.md`       | Parallel agent-facing rules    | same class of content as `AGENTS.md`                 |
| `install.md`      | Fresh-install path             | prerequisites, install steps, first-run verification |
| `SKILL.md`        | Reusable task guidance         | bounded workflow, triggers, references               |

If a document mostly explains a package or folder, prefer `README.md`. If it
mostly tells an agent what to do, prefer `AGENTS.md`, `CLAUDE.md`, or
`SKILL.md`.

---

## Placement

Default to the highest level that can own the guidance cleanly.

- Root docs own repo-wide rules
- Package or feature docs should only exist when parent docs are not enough
- Most deep directories need no local instruction file
- Guides belong in `contributing/guides` when the topic cuts across multiple
  packages or workflows

---

## Repo-Specific Notes

This repo carries both `AGENTS.md` and `CLAUDE.md`. For repo-wide guidance,
keep them aligned unless a difference is deliberate and clearly scoped.

This repo also includes multiple skill namespaces. A `SKILL.md` should stay
with its owning skill and document the workflow that skill is responsible for,
not general repo policy.

---

## Maintenance

When changing an instruction artifact:

- verify commands against the current repo state
- update every authoritative copy, not just one mirror
- link to guides or specs instead of duplicating long explanations
- delete stale instructions instead of letting them quietly drift

---

## See Also

- [Guide Authoring](./guide-authoring.md) - When guidance should become a guide
- [Agent Accessibility](./agent-accessibility.md) - Install and skill upkeep
