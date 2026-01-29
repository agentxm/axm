---
name: documentation
description: Documentation conventions for README.md and CLAUDE.md. Use when creating or reviewing documentation files.
user-invocable: false
---

# Documentation Conventions

Apply these conventions when writing documentation.

---

## Writing Style by Audience

| Aspect   | Human-Facing (README, guides) | Agent-Facing (CLAUDE.md)            |
| -------- | ----------------------------- | ----------------------------------- |
| Length   | Clear over brief              | Extremely terse                     |
| Grammar  | Complete sentences            | Optional; sacrifice for brevity     |
| Tone     | Friendly, approachable        | Direct, operational                 |
| Context  | Explain "why" not just "what" | No explanations needed              |
| Examples | Help understanding            | Only if essential for correct usage |

### Example Translations

| Human-facing (README)                                          | Agent-facing (CLAUDE.md)       |
| -------------------------------------------------------------- | ------------------------------ |
| "Run the test suite before submitting a pull request."         | `pnpm test` before PR          |
| "This package uses Effect for error handling and concurrency." | Effect for errors, concurrency |

---

## README.md

README is the entry point for humans. Template:

```markdown
# Directory Name

One-line description of what this contains.

## Overview

2-3 sentences expanding on purpose and scope.

## Structure

Brief explanation of how contents are organized.
```

### README.md Checklist

- [ ] **H1 names directory** — Title matches directory name or purpose
- [ ] **One-line description** — First line explains what directory contains
- [ ] **Overview present** — 2-3 sentences on purpose and scope
- [ ] **Structure explained** — How contents are organized
- [ ] **Cross-references specs** — Links to specs rather than duplicating
- [ ] **Human-facing style** — Complete sentences, friendly tone

---

## CLAUDE.md

CLAUDE.md tells agents how to work here—commands, patterns, constraints.
Template:

```markdown
# [Directory Name]

> See README.md for context.

## Agent Instructions

[Operational details for working in this directory]
```

### Content Examples

| Content type            | Example                          |
| ----------------------- | -------------------------------- |
| Operational constraints | `pnpm typecheck` after .ts edits |
| Pattern preferences     | Composition over inheritance     |
| Tool-specific commands  | `nx affected` not `nx run-many`  |
| Warnings                | Don't modify `dist/`             |

### CLAUDE.md Checklist

- [ ] **Justified existence** — Has agent-specific instructions beyond README
- [ ] **Context available** — README provides assumed context
- [ ] **Extremely terse** — Minimal words; grammar sacrificed for brevity
- [ ] **Operational only** — Commands, constraints, patterns—no explanations
- [ ] **Additive to parent** — Extends parent CLAUDE.md, doesn't repeat it

---

## Document Frontmatter

Required for guides and specs:

```yaml
---
status: active
description: When to consult this document and what guidance it provides.
---
```

### Status Values

| Status        | Reliability | Usage                                |
| ------------- | :---------: | ------------------------------------ |
| `placeholder` |     Low     | Do not rely on                       |
| `draft`       |   Medium    | Use directionally; subject to change |
| `active`      |    High     | Use as authoritative source          |
| `deprecated`  |     N/A     | Seek superseding documents           |

### Frontmatter Checklist

- [ ] **Has status** — One of: placeholder, draft, active, deprecated
- [ ] **Has description** — Answers "when should I read this?"
- [ ] **YAML valid** — Frontmatter parses without errors

---

## Document Flow

| Principle                    | Description                              |
| ---------------------------- | ---------------------------------------- |
| **Show before tell**         | Example early grounds abstract rules     |
| **Concept before exception** | Define X before "when not to use X"      |
| **Progressive disclosure**   | Simple core first, nuanced details later |
| **Inverted pyramid**         | Key takeaway first, details follow       |

---

## Anti-Patterns

- [ ] **No duplication** — Each piece of information lives in one place
- [ ] **No placeholder content** — Files have content or don't exist
- [ ] **No sensitive data** — No secrets, credentials, or security details
- [ ] **No spec in README** — README links to specs, doesn't duplicate
- [ ] **No prose in CLAUDE.md** — Agent docs don't have explanatory text
- [ ] **No orphan CLAUDE.md** — CLAUDE.md has README context available

---

## Cross-References

When linking to other documents:

- [ ] **Reference justified** — Link provides value vs including content
- [ ] **Condition specified** — Explain when/why to consult linked doc
- [ ] **Self-contained for core path** — Usable without following links
- [ ] **No vague references** — No "see X for more" without explaining what
