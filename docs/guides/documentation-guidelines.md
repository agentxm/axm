---
status: active
description: When creating or reviewing README.md, CLAUDE.md, guides, or other
  documentation artifacts; covers style, structure, and quality assessment.
---

# Documentation Guidelines

Documentation serves two audiences with different needs: humans learning about
the codebase, and agents executing tasks within it. Without deliberate
separation, human docs become cluttered with operational commands, and agent
docs become bloated with explanatory context. This guide helps you write
documentation that serves both audiences effectively.

## Scope

**Applies to:**

- README.md and CLAUDE.md files throughout the repository
- Guides and reference documents in `docs/`
- Specifications and design documents
- Any human-curated markdown intended for ongoing use

**Does not apply to:**

- Generated documentation (API docs from code, auto-generated changelogs)
- Third-party or vendored content
- Content outside this repository

**Related guides** (consult only when indicated):

- [Guide Authoring](guide-authoring.md#guide-structure-pattern) — Consult when
  creating a new guide; provides template and checklist-first methodology
- [Guide Authoring: Guides vs Skills](guide-authoring.md#guides-vs-skills) —
  Consult when deciding whether content belongs in a guide or skill

---

## Quick Example

_Illustrates: "Audience identified," "Tone matches audience," "Extremely terse,"
"Operational only," "H1 names directory," "Structure explained"_

_Before_ — A README that mixes concerns and lacks structure:

```markdown
# utils

Various utility functions. Run `npm test` to test. The dateFormat function uses
moment.js. Don't modify the legacy/ folder. See api.md for more.
```

_After_ — Separated concerns with proper structure:

**README.md** (human-facing):

```markdown
# Utils

Shared utility functions for date formatting, string manipulation, and
validation.

## Structure

- `date/` — Date formatting utilities (uses Temporal API)
- `string/` — String manipulation helpers
- `legacy/` — Deprecated utilities pending removal
```

**CLAUDE.md** (agent-facing):

```markdown
# Utils

> See README.md for context.

- `pnpm test` before changes
- Don't modify `legacy/`—deprecated, pending removal
- Temporal API for dates, not moment.js
```

The README explains _what_ and _why_; the CLAUDE.md provides _operational
commands_. This separation keeps human docs readable while giving agents the
terse instructions they need.

---

## Writing Style by Audience

Different audiences need different documentation styles. Human readers benefit
from context and explanation—they're learning. Agent readers need operational
brevity—they're executing. Matching style to audience prevents wasted attention
for humans and wasted tokens for agents.

For a quick reference table of style differences by audience, see the
`/documentation` skill.

### Writing Style Checklist

- [ ] **Audience identified** — Document clearly targets humans or agents
- [ ] **Tone matches audience** — Human: friendly, approachable; Agent: direct,
      terse
- [ ] **Grammar matches audience** — Human: complete sentences; Agent: fragments
      acceptable
- [ ] **Context matches audience** — Human: includes rationale; Agent:
      operational commands only
- [ ] **Length appropriate** — Human: clear over brief; Agent: extremely terse

---

## Document Flow

How you sequence content affects comprehension. Poor flow forces readers to hold
abstract concepts in memory before seeing examples, or to learn exceptions
before understanding the rule. Good flow builds understanding progressively.

For a quick reference table of flow principles, see the `/documentation` skill.

### Applying Flow Principles

**Show before tell**: Add a "Quick Example" subsection early in guides. One
concrete instance helps readers anchor the abstract patterns that follow.

**Concept before exception**: If you have both "What is X" and "When not to use
X" sections, the definition must come first. Readers can't evaluate exceptions
to a pattern they haven't learned.

**Progressive disclosure**: Structure sections from general to specific. Core
pattern → naming conventions → templates → edge cases. Don't interleave advanced
topics with fundamentals.

**Inverted pyramid**: The first paragraph after a heading should convey the key
point. Supporting details, rationale, and caveats follow. Readers who skim get
the essential; readers who continue get depth.

### Document Flow Checklist

- [ ] **Example early** — Guide includes brief example before detailed rules
- [ ] **Definition precedes exceptions** — "What is X" before "when not to use
      X"
- [ ] **Simple before complex** — Core concepts precede edge cases and nuances
- [ ] **Lead not buried** — Key point in first paragraph of each section
- [ ] **Sections build** — Later sections assume earlier ones, not vice versa

---

## Purpose and Desired Outcome

Documents that state their purpose and desired outcome early are easier to
evaluate and improve. Without explicit goals, reviewers must infer intent—and
different readers may infer differently. Making goals explicit enables objective
assessment: does this document achieve what it set out to do?

### Why This Matters

**For evaluation**: A document that says "This guide helps developers write
consistent API error responses" can be evaluated against that goal. Does it
actually help? Are developers writing more consistent responses after reading
it?

**For improvement**: When a document states "Readers should be able to configure
logging in under 5 minutes," you can test that claim and identify friction
points. Without a stated outcome, "improvement" becomes subjective.

**For maintenance**: Explicit goals help maintainers decide what to keep, cut,
or expand. Content that doesn't serve the stated purpose is a candidate for
removal.

### Placement

State purpose and desired outcome in the first paragraph or two—before diving
into details. This follows the inverted pyramid principle: readers know
immediately whether the document serves their needs.

### Examples

_Bad — purpose unclear, no stated outcome:_

> This document covers authentication.

_Good — clear purpose and outcome:_

> This guide explains how to add authentication to API endpoints. After reading,
> you should be able to protect any endpoint with JWT validation in under 10
> minutes.

_Bad — outcome buried or implicit:_

> Authentication is important for security. There are many ways to implement it.
> This document discusses JWT tokens...

_Good — outcome upfront:_

> **Goal**: Developers can add role-based access control to existing endpoints
> without modifying the auth middleware.

### Purpose and Outcome Checklist

- [ ] **Purpose stated early** — First paragraph explains what the document does
- [ ] **Outcome measurable** — Desired result is concrete enough to verify
- [ ] **Scope bounded** — Clear what the document does and doesn't cover
- [ ] **Evaluation enabled** — A reader could assess whether the document
      achieves its stated goal
- [ ] **Non-goals explicit** — What document doesn't cover is stated when
      ambiguous

---

## README.md

README.md is the entry point for any directory—both humans and agents read it
first. A good README orients readers to what's here and how to navigate it,
without duplicating content that lives elsewhere. This separation prevents
information drift and keeps maintenance burden low.

For the README.md template and content examples, see the `/documentation` skill.

### README.md Checklist

- [ ] **H1 names directory** — Title matches directory name or purpose
- [ ] **One-line description** — First line explains what directory contains
- [ ] **Overview present** — 2-3 sentences expanding on purpose and scope
- [ ] **Structure explained** — How contents are organized (if not obvious)
- [ ] **Cross-references specs** — Links to authoritative specs rather than
      duplicating content
- [ ] **Human-facing style** — Complete sentences, friendly tone, explains "why"
- [ ] **Matches actual state** — Content reflects current directory, not
      aspirational

---

## CLAUDE.md

CLAUDE.md exists because agents need different information than humans. README
explains what's here; CLAUDE.md tells agents how to work here—commands to run,
patterns to follow, constraints to observe. This separation keeps human docs
readable while giving agents the operational detail they need.

For the CLAUDE.md template and content examples, see the `/documentation` skill.

### Nested Inheritance

Claude Code reads all CLAUDE.md files from current directory up to repo root.
All instructions accumulate—child files don't replace parents.

_Illustrates: "Additive to parent"_

```markdown
# API Development

> Adds to root CLAUDE.md conventions.

- Effect HttpServer for endpoints
- Test: `pnpm nx test api`
```

See "Overrides rare" and "Overrides explicit" in the CLAUDE.md Checklist for
when and how to handle parent convention exceptions.

### CLAUDE.md Checklist

- [ ] **Justified existence** — Has agent-specific instructions beyond README
- [ ] **Context available** — README (local or parent) provides assumed context
- [ ] **Extremely terse** — Minimal words; grammar sacrificed for brevity
- [ ] **Operational only** — Commands, constraints, patterns—no explanations
- [ ] **Additive to parent** — Extends parent CLAUDE.md, doesn't repeat it
- [ ] **Overrides rare** — Overrides parent conventions sparingly; most
      directories extend rather than contradict
- [ ] **Overrides explicit** — When differing from parent, notes exceptions
      clearly

---

## Document Frontmatter

Frontmatter enables quick triage. Without it, readers must scan entire documents
to assess relevance; agents may rely on outdated or incomplete content without
knowing. Status and description fields solve this by making reliability and
purpose immediately visible.

For the frontmatter template, see the `/documentation` skill.

### Field Definitions

| Field           | Required | Description                                         |
| --------------- | :------: | --------------------------------------------------- |
| `status`        |    ✅    | Document maturity level (see Status Values below)   |
| `description`   |    ✅    | 1-2 sentences answering "when should I read this?"  |
| `lastRefreshed` |    ⚠️    | Date content was last verified current (YYYY-MM-DD) |

**lastRefreshed** — Required for living documents that reference external
information (research, competitive analysis, tool documentation, API
references). Not required for internal guides that only reference this
repository's code.

When refreshing a document:

- Verify external links still work
- Confirm referenced tools/APIs haven't changed significantly
- Update any outdated information discovered
- Set `lastRefreshed` to the current date

### Status Values

**Active statuses** — Documents under active maintenance:

| Status        | Reliability | Agent Guidance                                 |
| ------------- | :---------: | ---------------------------------------------- |
| `placeholder` |     🔴      | Do not rely on; note as placeholder            |
| `draft`       |     🟡      | Use directionally; caveat as subject to change |
| `active`      |     🟢      | Use as authoritative source                    |

**Inactive statuses** — Documents no longer maintained; seek alternatives:

| Status       | Meaning                                     | Agent Guidance                            |
| ------------ | ------------------------------------------- | ----------------------------------------- |
| `deprecated` | Outdated; replacement may exist             | Seek superseding documents                |
| `archived`   | Historical record; no longer applies        | Reference only for historical context     |
| `superseded` | Replaced by newer document                  | Follow link to replacement document       |
| `obsolete`   | No longer relevant; technology/context gone | Do not use; document exists for reference |

### Description Examples

_Illustrates: "Has description"_

Good descriptions answer "When should I read this?":

- "Conventions for structuring README and CLAUDE.md files in this repository."
- "How to design Effect services with inferred interfaces and proper layering."
- "Citation requirements and status conventions for documentation artifacts."

### Working with Non-Active Content

When tasks depend on non-active documents, apply these handling rules:

- [ ] **Placeholder handled** — Communicate what placeholders need completion
      and what's missing
- [ ] **Draft disclaimed** — Note assumptions made; flag areas that may change
- [ ] **Deprecated flagged** — Recommend seeking updated sources if available
- [ ] **Missing status treated** — Treat as draft and note this assumption

### Frontmatter Checklist

- [ ] **Has status** — Active: placeholder, draft, active; Inactive: deprecated,
      archived, superseded, obsolete
- [ ] **Has description** — 1-2 sentences answering "when should I read this?"
- [ ] **Has lastRefreshed** — Date present for docs referencing external content
- [ ] **YAML valid** — Frontmatter parses without errors
- [ ] **Status accurate** — Reflects actual document maturity
- [ ] **Refresh date current** — lastRefreshed updated when content verified
- [ ] **Non-active disclaimed** — Task output notes reliance on
      non-authoritative content
- [ ] **Template referenced** — Non-inactive documents based on a template
      include a link to that template

---

## Citations

AI-generated content may contain hallucinations; human-written summaries may
misremember sources. Citations provide a verification path—readers can check
facts, agents can trace claims to authoritative content, and future maintainers
can update information when sources change.

### Citation Methods

| Scenario                      | Approach                                          |
| ----------------------------- | ------------------------------------------------- |
| Fact from specific source     | Hyperlink adjacent to fact                        |
| Unverified fact               | Mark with "[unverified]" or similar notation      |
| Summary referencing other doc | Mention where to find authoritative/cited content |

Acceptable formats: hyperlinks, parenthetical citations, footnotes—whatever aids
readability and maintains integrity.

### Citations Checklist

- [ ] **Sources hyperlinked** — Facts from external sources include adjacent
      link
- [ ] **Unverified marked** — Facts without citations marked as "[unverified]"
- [ ] **Summaries reference source** — Summary docs mention where to find
      citations
- [ ] **Format consistent** — Citation style uniform throughout document
- [ ] **Links valid** — Cited URLs resolve and point to expected content

---

## Cross-References to Other Documents

Cross-references create implicit context dependencies. Every link to another
guide is a potential context expansion for agents—if the reference doesn't
clearly specify when to follow it, agents may load the entire linked document
"just in case." Undisciplined linking leads to context bloat: agents reading
multiple large documents when the current guide should have been self-contained.

### Reference Types

| Type                  | Definition                                        | Example Format                                    |
| --------------------- | ------------------------------------------------- | ------------------------------------------------- |
| **Strict dependency** | Reader cannot follow this guide without the other | "Prerequisite: Read [X] first for Y context"      |
| **Conditional**       | Specific circumstances require the other document | "Consult [X] when doing Y" or "If doing Z, see X" |

### Why These Rules Matter

Cross-references cost attention. Every link is a decision point: should I follow
this? Agents may load entire documents "just in case." Undisciplined linking
leads to context bloat—agents reading multiple large documents when the current
guide should have been sufficient.

Self-containment reduces this cost. When essential information lives directly in
the guide, readers don't need to context-switch. Attribution preserves the
source while keeping attention local.

Conditioning references prevents unnecessary loading. A vague "see X" forces
readers to click through to assess relevance. A specific trigger ("when doing
Y") lets them skip confidently when Y doesn't apply.

Upfront dependency declarations respect reader time. If someone needs
prerequisites, they should know before investing in the main content—not
discover mid-read that they lack context.

See the Cross-Reference Checklist below for specific requirements.

### Examples

_Illustrates: "Condition specified," "No vague references"_

_Bad — vague reference that may trigger unnecessary context loading:_

> For more on checklists, see the Checklist Guidelines.

_Good — conditioned reference with clear trigger:_

> When writing multi-item checklists (5+ items), consult
> [Guide Authoring: Checklist Design](guide-authoring.md#checklist-design) for
> grouping and ordering conventions.

### Cross-Reference Checklist

- [ ] **Reference justified** — Each link provides value that cannot be achieved
      by including the content directly
- [ ] **Condition specified** — Reference explains when/why to consult the
      linked document
- [ ] **Self-contained for core path** — Guide is usable without following
      non-dependency links
- [ ] **No vague references** — No "see X for more" without explaining what
      "more" means and when it's needed
- [ ] **Dependencies declared upfront** — Strict dependencies listed in Scope
      section
- [ ] **Links valid** — Referenced files exist and anchor targets resolve

---

## Document Types and Naming

Consistent naming and formatting conventions make documents discoverable and
scannable. Typed H1s help readers quickly identify document purpose; date
prefixes enable chronological sorting; author fields establish provenance for
AI-generated content.

### Document Types Checklist

- [ ] **H1 follows pattern** — Formal docs use `<type>: <name>` format (e.g.,
      "Report: AI Coding Assistants Year in Review")
- [ ] **Author identified** — Author field present; "Claude" if AI-generated
- [ ] **Contributors listed** — Secondary authors noted when applicable
- [ ] **Activity dated** — Files in `/activity` prefixed with `YYYY-MM-DD`
- [ ] **Emojis aid scanning** — Tables use ✅/❌ for yes/no, 🟢/🟡/🔴 for status

---

## For Human Review Section

Flag situations requiring human judgment at the end of documents (before "See
Also" if present). See the "Human review items current" checklist item in All
Documents Checklist for what needs flagging.

### Format

```markdown
## For Human Review

- [ ] **Label** — What needs review and why
```

### Example

_Illustrates: "Human review items current" — judgment calls, uncertainties,
conflicts_

```markdown
## For Human Review

- [ ] **API naming** — Changed `getUserById` to `fetchUser`; verify convention
- [ ] **Missing validation** — No input validation for email field; intentional?
- [ ] **Conflicting docs** — README says X but spec says Y; which is correct?
```

### For Human Review Checklist

- [ ] **Agent-added only** — Agents add items; only humans remove them
- [ ] **Not blocking** — If answer needed now, use AskUserQuestion instead
- [ ] **Single-session scope** — If cross-session tracking needed, create a
      beads issue instead
- [ ] **Actionable items** — Each item explains what needs review and why
- [ ] **Placement correct** — Section appears at end of document, before See
      Also

---

## Anti-Patterns

Documentation problems compound over time. Duplication causes drift; placeholder
files mislead readers; secrets in docs become security incidents. These
anti-patterns are worth checking explicitly because they're easy to introduce
and hard to notice.

### Anti-Patterns Checklist

- [ ] **No duplication** — Each piece of information lives in exactly one place
- [ ] **No checklist restating** — Summary checklists reference section
      checklists rather than duplicating items
- [ ] **No placeholder content** — Files have meaningful content or don't exist
- [ ] **No sensitive data** — No secrets, credentials, or security details
- [ ] **No spec in README** — README links to specs, doesn't duplicate them (see
      also README.md Checklist: "Cross-references specs")
- [ ] **No prose in CLAUDE.md** — Agent docs don't have explanatory text (see
      also CLAUDE.md Checklist: "Extremely terse," "Operational only")
- [ ] **No orphan CLAUDE.md** — CLAUDE.md has README context available (see also
      CLAUDE.md Checklist: "Context available")
- [ ] **Examples minimal** — Only for nuanced points; keep brief; templates are
      exceptions
- [ ] **No excessive cross-references** — Links to other docs are conditioned
      and justified (see Cross-Reference Checklist)

---

## Quality Assessment

Use this section to assess documentation artifacts. Apply the relevant
section-specific checklists based on document type.

### Template Precedence

This guide's conventions always apply. When a document is based on a template
and there is a conflict between template conventions and this guide, **the
template takes precedence** for that specific item. Templates encode
domain-specific conventions that may intentionally deviate from general
guidelines for good reasons. When assessing template-based documents, apply both
the template requirements and this guide; only defer to the template where they
conflict.

### Assessment Process

1. **Identify document type** — README, CLAUDE.md, guide, reference, or other
2. **Check for template** — If document references a template, note its
   requirements
3. **Apply universal checklist** — All Documents Checklist below
4. **Apply type-specific checklist** — Find the relevant section earlier in this
   guide
5. **Apply template requirements** — If template-based, apply template
   conventions (defer to template only where it conflicts with this guide)
6. **Apply anti-patterns checklist** — Check for common mistakes

### All Documents Checklist

These items apply to every documentation artifact.

- [ ] **Purpose clear** — First paragraph explains what document is for and
      desired outcome (see Purpose and Outcome Checklist)
- [ ] **Audience appropriate** — Style matches target (see Writing Style
      Checklist)
- [ ] **Frontmatter present** — Status and description for living documents (see
      Frontmatter Checklist)
- [ ] **Template conformance** — If based on a template, conforms to template
      structure (template takes precedence only where it conflicts with this
      guide)
- [ ] **Anti-patterns avoided** — Passes Anti-Patterns Checklist above
- [ ] **Cross-references appropriate** — Links to other docs follow
      Cross-Reference Checklist (conditioned, justified, minimal)
- [ ] **Human review items current** — Situations needing human judgment flagged
      with suggestions for improvement:
  - Judgment calls without clear guidance — consult stakeholders, document
    decision rationale, create ADR
  - Uncertainties about correctness — verify with tests, check against source,
    flag for SME review
  - Gaps requiring decisions — enumerate options with tradeoffs, propose
    default, escalate if blocking
  - Conflicts between sources — identify authoritative source, reconcile
    differences, flag for resolution
  - Consequential changes — request explicit approval, document impact, consider
    rollback plan
  - Important findings outside scope — create follow-up issue, document for
    future reference
  - Excessive content length (>500 lines) — split into focused guides, extract
    reference material, consolidate redundant sections

### Type-Specific Checklists

| Document Type           | Checklist Location    |
| ----------------------- | --------------------- |
| README.md               | README.md Checklist   |
| CLAUDE.md               | CLAUDE.md Checklist   |
| Reference/research docs | Citations Checklist   |
| Guides                  | See [Guide Authoring] |

[Guide Authoring]: guide-authoring.md#guide-quality-checklist

---

## See Also

- `/documentation` skill — Ready-to-use templates and quick reference tables
- `/agent-docs` skill — Agent-specific documentation authoring patterns
- [Guide Authoring](guide-authoring.md) — When creating guides specifically
