# Documentation Guidelines

Shared writing rules for docs in this repo. Use this guide when adding or
editing human-facing docs, agent-facing instructions, guides, specs, or
contributor workflows. It focuses on audience, flow, and source-of-truth
discipline.

## Key Resources

- [Instructions Guide](./instructions.md) - Which document should own what
- [Guide Authoring](./guide-authoring.md) - How to add or revise a guide

---

## Audience Fit

Different docs serve different readers. Mixing them creates noise.

- Human-facing docs explain what and why
- Agent-facing docs stay terse and operational
- A document should have one primary audience, even if both humans and agents
  read it
- If a file is mostly commands, constraints, or workflow rules, it probably
  belongs in `AGENTS.md`, `CLAUDE.md`, or `SKILL.md`

---

## Flow

Readers should understand the purpose before the details.

- State the purpose and scope in the opening paragraph
- Put the most important takeaway first
- Show a short concrete example early when the topic is abstract
- Explain the core rule before exceptions or edge cases
- Move from overview to detail, not the other way around

---

## Single Source of Truth

Documentation drifts fastest when the same rule is copied into many places.

- Link to the authoritative file instead of restating long sections
- Keep commands, flags, and file paths verified against the real repo
- If a command changes, update every document that claims to be authoritative
- Do not import internal-only product, infra, or customer details into this
  public repo

---

## Review Bar

Before you keep a doc change:

- verify the commands against the current repo or CLI help output
- remove stale aspirational language
- keep examples minimal and copy-pasteable
- prefer project-specific guidance over generic filler

---

## See Also

- [Guide Authoring](./guide-authoring.md) - Guide structure and scope
- [Agent Accessibility](./agent-accessibility.md) - Install and skill docs
