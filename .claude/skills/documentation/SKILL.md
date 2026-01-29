---
name: documentation
description: Human-facing documentation (README.md) conventions. Use when writing docs for human readers. For agent-facing docs, use /agent-docs instead.
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
      → Rename H1 to match directory name or clarify its purpose
- [ ] **One-line description** — First line explains what directory contains
      → Add a single sentence after H1 summarizing contents
- [ ] **Overview present** — 2-3 sentences on purpose and scope
      → Add Overview section expanding on the one-liner
- [ ] **Structure explained** — How contents are organized
      → Add Structure section describing organization
- [ ] **Cross-references specs** — Links to specs rather than duplicating
      → Replace duplicated spec content with links to canonical source
- [ ] **Human-facing style** — Complete sentences, friendly tone
      → Rewrite terse fragments as complete, approachable sentences

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
      → If no unique agent instructions, delete the CLAUDE.md
- [ ] **Context available** — README provides assumed context
      → Create README.md with context before adding CLAUDE.md
- [ ] **Extremely terse** — Minimal words; grammar sacrificed for brevity
      → Strip articles, pronouns, explanations; use fragments
- [ ] **Operational only** — Commands, constraints, patterns—no explanations
      → Move "why" content to README, keep only "what" and "how"
- [ ] **Additive to parent** — Extends parent CLAUDE.md, doesn't repeat it
      → Delete content already in parent CLAUDE.md

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
      → Add `status:` field with appropriate value from Status Values table
- [ ] **Has description** — Answers "when should I read this?"
      → Add `description:` explaining when to consult this document
- [ ] **YAML valid** — Frontmatter parses without errors
      → Fix YAML syntax (check colons, indentation, quotes)

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
      → Choose canonical location, replace duplicates with links
- [ ] **No placeholder content** — Files have content or don't exist
      → Add real content or delete the file
- [ ] **No sensitive data** — No secrets, credentials, or security details
      → Move secrets to environment variables or secret manager
- [ ] **No spec in README** — README links to specs, doesn't duplicate
      → Replace spec content with link to canonical spec
- [ ] **No prose in CLAUDE.md** — Agent docs don't have explanatory text
      → Move explanations to README, keep only operational content
- [ ] **No orphan CLAUDE.md** — CLAUDE.md has README context available
      → Create README.md or add `> See README.md for context.`

---

## Cross-References

When linking to other documents:

- [ ] **Reference justified** — Link provides value vs including content
      → If content is short and stable, inline it instead of linking
- [ ] **Condition specified** — Explain when/why to consult linked doc
      → Add context like "for advanced usage" or "when debugging"
- [ ] **Self-contained for core path** — Usable without following links
      → Include essential info inline; links for depth only
- [ ] **No vague references** — No "see X for more" without explaining what
      → Specify what the linked doc provides (e.g., "see X for auth setup")
