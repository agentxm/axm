---
name: agent-docs
description: Authoring CLAUDE.md, AGENTS.md, and SKILL.md files. Use when creating or editing agent-facing documentation.
user-invocable: false
---

# Agent Documentation Authoring

Agent-facing docs (CLAUDE.md, AGENTS.md, SKILL.md) optimize for machine
consumption. Brevity trumps readability.

---

## Core Principle

**Ultra-terse.** Sacrifice grammar, articles, complete sentences. Every word
must earn its place.

---

## Style Rules

| Rule                  | Example                                                 |
| --------------------- | ------------------------------------------------------- |
| Drop articles         | "Use Effect for I/O" not "Use the Effect..."            |
| Drop subjects         | "Run tests before PR" not "You should run..."           |
| Use fragments         | "Effect for async. No raw Promises."                    |
| Abbreviate when clear | "deps" not "dependencies", "config" not "configuration" |
| Imperative voice      | "Run X" not "X should be run"                           |
| No hedging            | "Do X" not "Consider doing X"                           |
| No explanations       | State rule, skip rationale                              |

---

## Format Patterns

### Commands/Instructions

```markdown
- `pnpm test` before PR
- No `any` types
- Effect for all I/O
```

### Tables over prose

```markdown
| Do      | Don't       |
| ------- | ----------- |
| Effect  | raw Promise |
| yield\* | async/await |
```

### Bullets over paragraphs

Bad:

> This project uses Effect for all business logic. You should avoid using raw
> Promises or async/await patterns.

Good:

> - Effect for business logic/I/O
> - No raw Promises or async/await

---

## File-Specific Notes

### CLAUDE.md

- Operational instructions for working in directory
- Inherits from parent CLAUDE.md (additive)
- Reference README for context, don't duplicate

### AGENTS.md

- Cross-agent instructions (not Claude-specific)
- Often at repo root or in shared directories

### SKILL.md

- Tactical patterns with checklists
- Self-contained (no external references)
- Auto-loaded when relevant

---

## Agent Docs Checklist

- [ ] **No articles** — Drop "the", "a", "an" where meaning preserved
- [ ] **No filler** — Remove "please", "should", "consider", "make sure to"
- [ ] **Fragments OK** — Complete sentences not required
- [ ] **Tables preferred** — Use tables over prose for comparisons/lists
- [ ] **Bullets preferred** — Use bullets over paragraphs
- [ ] **Commands inline** — Use backticks: `pnpm test`
- [ ] **No rationale** — State what, skip why
