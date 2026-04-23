---
status: active
last-reviewed: 2026-04-13
version: 0.2.1
description: Shared writing rules for human-facing docs, agent-facing instructions, guides,
  specs, and contributor workflows
depends-on:
  - ./instructions.md
  - ./guide-authoring.md
---

# Documentation Guidelines

Documentation serves two audiences with different needs: humans learning about
the codebase, and agents executing tasks within it. Without deliberate
separation, human docs become cluttered with operational commands, and agent
docs become bloated with explanatory context. This guide helps you write
documentation that serves both audiences effectively.

This guide is authoritative for shared writing conventions, frontmatter,
citations, cross-reference discipline, and review standards. Instruction-file
ownership lives in [Instructions Guide](instructions.md), and guide structure
lives in [Guide Authoring](guide-authoring.md).

## Scope

**Applies to:**

- README.md and CLAUDE.md files throughout the repository
- Guides and reference documents in `contributing/guides/`
- Specifications and design documents
- Any human-curated markdown intended for ongoing use

**Does not apply to:**

- Generated documentation (API docs from code, auto-generated changelogs)
- Third-party or vendored content
- Content outside this repository

**Related guides** (consult only when indicated):

- [Instructions Guide](instructions.md) — Authoritative for whether to create
  `README.md`, `CLAUDE.md`, or other instruction files, where they live, and
  what belongs in them
- [Guide Authoring](guide-authoring.md#guide-structure-pattern) — Authoritative
  for guide structure and checklist-first methodology

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
from context and explanation — they're learning. Agent readers need operational
brevity — they're executing. Matching style to audience prevents wasted
attention for humans and wasted tokens for agents.

### Style Reference

| Aspect   | Human-Facing (README, guides, specs) | Agent-Facing (CLAUDE.md)            |
| -------- | ------------------------------------ | ----------------------------------- |
| Length   | Clear over brief                     | Extremely terse                     |
| Grammar  | Complete sentences                   | Optional; sacrifice for brevity     |
| Tone     | Friendly, approachable               | Direct, operational                 |
| Context  | Explain "why" not just "what"        | No explanations needed              |
| Examples | Help understanding                   | Only if essential for correct usage |

### Example Translations

_Illustrates: "Tone matches audience," "Grammar matches audience," "Context
matches audience"_

| Human-facing (README)                                          | Agent-facing (CLAUDE.md)       |
| -------------------------------------------------------------- | ------------------------------ |
| "Run the test suite before submitting a pull request."         | `pnpm test` before PR          |
| "This package uses Effect for error handling and concurrency." | Effect for errors, concurrency |
| "See the API documentation for available endpoints."           | API docs: `docs/api.md`        |

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

### Flow Principles

| Principle                    | Description                                         | Anti-pattern                            |
| ---------------------------- | --------------------------------------------------- | --------------------------------------- |
| **Show before tell**         | Brief example early grounds abstract rules          | All rules first, example at end         |
| **Concept before exception** | Explain what something IS before when NOT to use it | "When not to use X" before defining X   |
| **Progressive disclosure**   | Simple core first, nuanced details later            | Edge cases mixed with fundamentals      |
| **Inverted pyramid**         | Key takeaway in first paragraph, details follow     | Burying the lead after lengthy preamble |

### Applying Flow Principles

**Show before tell**: Add a "Quick Example" subsection early in guides. One
concrete instance helps readers anchor the abstract patterns that follow.

**Concept before exception**: If you have both "What is X" and "When not to use
X" sections, the definition must come first. Readers can't evaluate exceptions
to a pattern they haven't learned.

**Progressive disclosure**: Structure sections from general to specific. Core
pattern, then naming conventions, then templates, then edge cases. Don't
interleave advanced topics with fundamentals.

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

## Document Frontmatter

Frontmatter enables quick triage. Without it, readers must scan entire documents
to assess relevance; agents may rely on outdated or incomplete content without
knowing. Status and description fields solve this by making reliability and
purpose immediately visible.

### Standard Schema

```yaml
---
status: active
last-reviewed: 2026-04-03
version: 0.1.0
description: When to consult this document and what guidance it provides.
depends-on:
  - path/to/related-doc.md
---
```

Use this schema for documents under `contributing/guides/`. `README.md`,
`CLAUDE.md`, and `AGENTS.md` normally omit frontmatter unless a local convention
explicitly requires it.

### Field Definitions

| Field           | Required | Description                                                       |
| --------------- | :------: | ----------------------------------------------------------------- |
| `status`        |   yes    | Document maturity level (see Status Values below)                 |
| `last-reviewed` |   yes    | Date the document was last reviewed for accuracy (YYYY-MM-DD)     |
| `version`       |   yes    | Document revision version                                         |
| `description`   |   yes    | 1-2 sentences: when to consult (trigger) + what's here (preview)  |
| `depends-on`    |   yes    | Related documents this file relies on or should stay aligned with |

When refreshing a document:

- Verify linked documents and anchors still resolve
- Confirm the scope and authority statements still match reality
- Update any outdated information discovered
- Set `last-reviewed` to the current date

### Status Values

**Active statuses** — Documents under active maintenance:

| Status        | Reliability | Agent Guidance                                 |
| ------------- | :---------: | ---------------------------------------------- |
| `placeholder` |     low     | Do not rely on; note as placeholder            |
| `draft`       |   medium    | Use directionally; caveat as subject to change |
| `active`      |    high     | Use as authoritative source                    |

**Inactive statuses** — Documents no longer maintained; seek alternatives:

| Status       | Meaning                                     | Agent Guidance                            |
| ------------ | ------------------------------------------- | ----------------------------------------- |
| `deprecated` | Outdated; replacement may exist             | Seek superseding documents                |
| `archived`   | Historical record; no longer applies        | Reference only for historical context     |
| `superseded` | Replaced by newer document                  | Follow link to replacement document       |
| `obsolete`   | No longer relevant; technology/context gone | Do not use; document exists for reference |

### Writing Descriptions

_Illustrates: "Has description"_

Good descriptions answer two questions: **"When should I read this?"** and
**"What will I find?"** The first question helps readers filter on anticipated
scenarios — their current task matches a trigger. The second helps with
unanticipated scenarios — readers see enough of the content shape to
self-determine relevance for situations the author didn't predict. Together they
let readers decide without opening the document. The description appears in
frontmatter and feeds into index tables like the Guides Index in `CLAUDE.md`.

| Question          | Purpose                                                 | Without it                                                    |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| When to consult?  | Filters on **anticipated** scenarios (task match)       | Reader must open the doc to assess relevance                  |
| What will I find? | Discovers **unanticipated** relevance (content preview) | Reader can't find the doc useful for situations author missed |

**Deriving a description from the guide:**

1. **Start with the purpose statement.** Look at the first paragraph after the
   H1 — it should state what the guide helps you do. Distill that into the
   reader's trigger: what situation brings them here?
2. **Check scope and authority claims.** If the guide says "authoritative for X"
   or "applies when Y," those phrases are strong candidates for the trigger
   portion.
3. **Lead with tasks, then preview contents.** Name what the reader will _do_
   for the trigger, then sketch what the guide covers for discovery. The task
   gives the filter; the content preview gives the discovery surface.
4. **Include project context when it sharpens triage.** If the guide serves a
   specific role in the docs taxonomy (e.g., it's the only guide for a
   subsystem), mention the subsystem so readers can match on it.

**Structure:** 1-2 sentences. Sentence 1 = trigger (when/why to consult).
Sentence 2 (optional) = content shape or scope preview.

**Anti-patterns:**

| Anti-pattern           | Example                                  | Problem                                         |
| ---------------------- | ---------------------------------------- | ----------------------------------------------- |
| Restating the title    | "Guide for authentication."              | Adds no triage value beyond what the H1 gives   |
| Trigger-only           | "Consult when adding database entities." | Filters well but blocks discovery of other uses |
| Topic-only             | "Covers logging in the codebase."        | No trigger — doesn't say _when_ to consult it   |
| Too broad              | "Everything about the platform."         | Matches every situation, so filters nothing     |
| Too narrow             | "How to add the `user_id` log field."    | Misses the general case the guide covers        |
| Implementation-focused | "Documents the LogService Effect layer." | Names internals instead of the reader's task    |

**Good descriptions** answer both "when" and "what":

- "Choosing the right test level and avoiding common anti-patterns. Covers test
  placement, structure, and the behavior-over-implementation decision
  framework."
- "Standards for writing, structuring, and reviewing repository documentation.
  Covers audience fit, frontmatter, citations, cross-references, and review."

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
- [ ] **Has last-reviewed** — Date present in `YYYY-MM-DD` format
- [ ] **Has version** — Revision version is present
- [ ] **Has description** — 1-2 sentences: trigger (when to consult) + preview
      (what's here)
- [ ] **Has depends-on** — Related-doc paths are listed or `[]` is explicit
- [ ] **YAML valid** — Frontmatter parses without errors
- [ ] **Status accurate** — Reflects actual document maturity
- [ ] **Review date current** — `last-reviewed` updated when content is verified
- [ ] **Non-active disclaimed** — Task output notes reliance on
      non-authoritative content

---

## Single Source of Truth

Documentation drifts fastest when the same rule is copied into many places.

- Link to the authoritative file instead of restating long sections
- Keep commands, flags, and file paths verified against the real repo
- If a command changes, update every document that claims to be authoritative
- Do not import internal-only product, infra, or customer details into this
  public repo

---

## Instruction Files

This guide does not decide when to create `README.md`, `CLAUDE.md`, or other
instruction files, and it does not own their content boundaries. That authority
lives in [Instructions Guide](instructions.md).

Use this guide only for the shared writing-quality rules that still apply after
the right artifact has been chosen: audience fit, flow, frontmatter where
applicable, citations, cross-references, and final review.

### Instruction-File Boundary Checklist

- [ ] **Ownership respected** — Instruction-file creation, placement, and
      content-boundary decisions come from `instructions.md`
- [ ] **Shared rules applied** — Audience, flow, citation, and cross-reference
      rules from this guide are still applied when relevant
- [ ] **No duplicated checklists** — README/CLAUDE-specific checklists are not
      copied into this guide

---

## Citations

AI-generated content may contain hallucinations; human-written summaries may
misremember sources. Citations provide a verification path — readers can check
facts, agents can trace claims to authoritative content, and future maintainers
can update information when sources change.

### Citation Methods

| Scenario                      | Approach                                          |
| ----------------------------- | ------------------------------------------------- |
| Fact from specific source     | Hyperlink adjacent to fact                        |
| Unverified fact               | Mark with "[unverified]" or similar notation      |
| Summary referencing other doc | Mention where to find authoritative/cited content |

Acceptable formats: hyperlinks, parenthetical citations, footnotes — whatever
aids readability and maintains integrity.

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
guide is a potential context expansion for agents — if the reference doesn't
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
leads to context bloat — agents reading multiple large documents when the current
guide should have been sufficient.

Self-containment reduces this cost. When essential information lives directly in
the guide, readers don't need to context-switch. Attribution preserves the
source while keeping attention local.

Conditioning references prevents unnecessary loading. A vague "see X" forces
readers to click through to assess relevance. A specific trigger ("when doing
Y") lets them skip confidently when Y doesn't apply.

Upfront dependency declarations respect reader time. If someone needs
prerequisites, they should know before investing in the main content — not
discover mid-read that they lack context.

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
- [ ] **No spec in README** — README scope stays in the `instructions.md`
      boundary and links to authoritative specs
- [ ] **No prose in CLAUDE.md** — Agent docs stay terse and operational per
      `instructions.md`
- [ ] **No orphan CLAUDE.md** — CLAUDE.md keeps the README/parent-context model
      from `instructions.md`
- [ ] **Examples minimal** — Only for nuanced points; keep brief; templates are
      exceptions
- [ ] **No excessive cross-references** — Links to other docs are conditioned
      and justified (see Cross-Reference Checklist)

---

## Review Findings

When a review or analysis produces findings, present each item as:

1. **Finding** — what was observed
2. **Options** — lettered remediation choices (`a`, `b`, `c`, ...)
3. **Recommendation** — which option to take and why

```markdown
### 1. <Finding title>

<Description of the issue>

a) <Option A> — <brief description>
b) <Option B> — <brief description>
c) <Option C> — <brief description>

**Recommendation:** (b) — <rationale>
```

---

## Review Bar

Before you keep a doc change:

- Verify the commands against the current repo or CLI help output
- Remove stale aspirational language
- Keep examples minimal and copy-pasteable
- Prefer project-specific guidance over generic filler

### All Documents Checklist

These items apply to every documentation artifact.

- [ ] **Purpose clear** — First paragraph explains what document is for and
      desired outcome
- [ ] **Audience appropriate** — Style matches target (see Writing Style
      Checklist)
- [ ] **Frontmatter correct** — Documents that use frontmatter follow the
      standard schema (see Frontmatter Checklist)
- [ ] **Anti-patterns avoided** — Passes Anti-Patterns Checklist above
- [ ] **Cross-references appropriate** — Links to other docs follow
      Cross-Reference Checklist (conditioned, justified, minimal)
- [ ] **Human review items current** — Situations needing human judgment flagged

---

## See Also

- [Guide Authoring](guide-authoring.md) — When adding or revising a guide;
  consult for guide structure and scope
- [Agent Accessibility](agent-accessibility.md) — When updating install.md or
  SKILL.md after CLI or workflow changes
- [Instructions Guide](instructions.md) — When deciding which document should
  own a piece of content
