# Guides

Guides provide orientation for human readers on weighty topics—explaining the
"why" behind important decisions. Agent instructions belong in skills or
CLAUDE.md, not guides. This guide covers when to create guides and how to
structure them.

## Skills

- `/documentation` — Templates for README.md and CLAUDE.md
- `/agent-docs` — Ultra-terse style for agent-facing docs

---

## When to Create a Guide

Guides are warranted when a topic is significant enough to need conceptual
grounding. Not every skill needs a guide, and not every guide needs a skill.

### Guide-Worthy Topics

Create a guide when the topic:

- **Requires conceptual understanding** — Readers need to understand "why"
  before they can effectively apply the "how"
- **Spans multiple concerns** — The topic affects decisions across the codebase
- **Has lasting relevance** — The guidance remains useful over time, not just
  for a single task
- **Benefits from orientation** — New team members need context to work
  effectively in this area

### Checklist

Before creating a guide, verify:

- [ ] **Conceptual depth** — Topic requires understanding "why," not just "how"
- [ ] **Cross-cutting scope** — Guidance applies across multiple areas
- [ ] **Lasting reference** — Content serves ongoing orientation, not one-time
      use
- [ ] **Orientation value** — Newcomers benefit from this context

If the topic is purely tactical, agent-focused, or limited to one directory,
use a skill, README, or CLAUDE.md instead.

---

## Guide Structure

```markdown
# Guide Title

Purpose statement explaining what this guide covers and why it matters.

## Key Resources <!-- omit if none -->

- [Official Docs](https://example.com) — Authoritative reference
- [Related Guide](./related-guide.md) — Essential context

## Skills <!-- omit if none -->

- `/skill-name` — What this skill provides
- `/another-skill` — Another related skill

---

## [Topic Sections] <!-- required -->

Context explaining _why_ this topic matters and what decisions it informs.

---

## See Also <!-- omit if none -->

- [Notable Article](https://example.com) — Influential writing on the topic
- [Deep Dive](https://example.com) — Further exploration
- [Training Resource](https://example.com) — Learning materials
```
