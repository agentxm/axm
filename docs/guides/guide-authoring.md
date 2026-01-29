---
status: active
description: When creating or reviewing a guide in docs/guides/.
---

# Guide Authoring

Guides provide orientation for human readers on weighty topics—explaining the
"why" behind important decisions. Agent instructions belong in skills or
CLAUDE.md, not guides. This guide covers when to create guides and how to
structure them.

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

### When a Guide Isn't Needed

Skip the guide when:

- The topic is purely tactical (patterns, templates, checklists) — use a skill
- The audience is agents, not humans — use a skill or CLAUDE.md
- The scope is limited to one package or directory — use a README
- The content is a one-time explanation — document inline or in a PR

### When to Create a Guide Checklist

- [ ] **Conceptual depth** — Topic requires understanding "why," not just "how"
- [ ] **Cross-cutting scope** — Guidance applies across multiple areas
- [ ] **Lasting reference** — Content serves ongoing orientation, not one-time
      use
- [ ] **Orientation value** — Newcomers benefit from this context

---

## Guides vs Skills

| Aspect       | Guides                         | Skills                             |
| ------------ | ------------------------------ | ---------------------------------- |
| **Audience** | Humans                         | Agents (and humans)                |
| **Purpose**  | Orientation, context, "why"    | Tactical patterns, "how-to"        |
| **Content**  | Rationale, concepts, decisions | Templates, checklists, code blocks |
| **Loading**  | Read on demand                 | Auto-loaded when relevant          |

Guides explain the reasoning behind choices for human readers. Skills provide
patterns that agents follow while working. A developer might read a guide once
to understand an area, while the corresponding skill auto-loads for agents
during related tasks.

---

## Guide Structure

```markdown
---
status: active
description: When should I read this guide? (one line)
---

# Guide Title

Purpose statement explaining what this guide covers and why it matters.

---

## [Topic Section]

Context explaining _why_ this topic matters and what decisions it informs.

### [Topic] Checklist

- [ ] **Item label** — Requirement statement

---

## Skills

- `/skill-name` — What this skill provides
```

### Structure Checklist

- [ ] **Frontmatter complete** — Has status and description
- [ ] **Clear purpose** — Opening explains what the guide covers
- [ ] **Sections explain why** — Each section provides conceptual context
- [ ] **Ends with Skills section** — Lists related skills with brief
      descriptions

---

## Skills

- `/documentation` — Templates for README.md and CLAUDE.md
- `/agent-docs` — Ultra-terse style for agent-facing docs
