---
status: active
last-reviewed: 2026-04-03
version: 0.2.0
description: Deciding whether a topic needs a guide; structuring guide content
depends-on: [./documentation-guidelines.md]
---

# Guide Authoring

Standards for writing guides that serve as authoritative references for both
humans and agents. Covers when to create a guide, structure, checklists, prose
style, cross-guide boundaries, and external documentation references. Does not
cover content research, publication workflows, or tooling.

## Key Resources

- [Guides README](./README.md) - Template and local conventions
- [Documentation Guidelines](./documentation-guidelines.md) - Shared writing
  rules
- [Instructions Guide](./instructions.md) - Document ownership

---

## When to Create a Guide

Not every piece of documentation should be a guide. Guides are for cross-cutting
concerns that span multiple directories or packages.

| Create a guide when...               | Use README.md instead when...      |
| ------------------------------------ | ---------------------------------- |
| Topic applies across the codebase    | Conventions are directory-specific |
| Content is reference material        | Content describes a single package |
| Guidance spans multiple packages     | Scope is one package or app        |
| Patterns recur in different contexts | Implementation is localized        |

Do not create a guide when:

- the content is a step-by-step workflow better captured in a skill
- the rule already lives clearly in AGENTS.md or CLAUDE.md

For artifact selection criteria, see
[Documentation Guidelines](./documentation-guidelines.md).

### When to Create a Guide Checklist

- [ ] **Cross-cutting scope** -- Topic applies across multiple directories or
      packages
- [ ] **Reference purpose** -- Content serves as ongoing reference, not one-time
      explanation
- [ ] **Not directory-specific** -- Conventions aren't limited to a single
      package
- [ ] **Recurring patterns** -- Guidance addresses patterns that appear in
      multiple contexts

---

## Core Principle: Checklists as Authority

Checklists are the authoritative reference for verifiable requirements. Prose
supports checklists -- it never duplicates them.

### Why Checklists First

| Aspect        | Checklist                    | Prose                             |
| ------------- | ---------------------------- | --------------------------------- |
| Scannability  | Instantly scannable          | Requires reading                  |
| Completeness  | Exhaustive, nothing missed   | Easy to miss items buried in text |
| Verifiability | Yes/no assessment            | Subjective interpretation         |
| Agent use     | Direct instruction following | Requires extraction               |
| Maintenance   | Easy to audit and update     | Duplication drifts                |

### The Duplication Problem

When guidance appears both as prose and in a checklist:

- Updates happen in one place, not both -- information drifts
- Readers see the same thing twice -- wastes attention
- Agents may get conflicting versions -- unreliable behavior

### Core Principle Checklist

- [ ] **Single source** -- Guidance appears in checklist OR prose, never both
- [ ] **Checklist authority** -- Verifiable requirements live in checklists, not
      prose
- [ ] **Prose references** -- Prose points to checklists ("see X checklist")
      rather than restating items

---

## Guide Structure Pattern

Typical shape for a guide section:

```markdown
---
status: active
description: When should I read this guide? (one line)
---

# Guide Title

One-line purpose statement (expands on description, defines scope).

---

## [Topic Section]

### Context (when needed)

Brief rationale explaining _why_ these requirements exist. Don't describe _what_
to do -- that's what the checklist is for.

### Examples (when helpful)

Concrete examples illustrating checklist items.

### [Topic] Checklist

- [ ] **Item name** -- Concise requirement statement
- [ ] **Another item** -- Another requirement
```

### Section Anatomy

| Component     | Purpose                                | Required |
| ------------- | -------------------------------------- | -------- |
| Context       | Explain _why_ (not _what_)             | Optional |
| Examples      | Illustrate checklist items             | Optional |
| Tables        | Reference data, comparisons, options   | Optional |
| **Checklist** | Authoritative, verifiable requirements | Required |

### Guide Structure Checklist

- [ ] **Ends with checklist** -- Every substantive section concludes with a
      checklist
- [ ] **Descriptive checklist names** -- Headers include topic (e.g., "Error
      Handling Checklist" not just "Checklist")
- [ ] **Focused scope** -- Each checklist covers one concern; never combine
      topics to reach an item count
- [ ] **No orphan sections** -- Sections without checklists are merged,
      converted, or removed
- [ ] **Context explains why** -- Context subsections explain rationale, not
      requirements
- [ ] **Examples illustrate** -- Examples reference which checklist items they
      demonstrate

---

## Checklist Design

Best practices for writing checklists that serve as authoritative, verifiable
requirements within guides.

### Item Format

The standard format makes items scannable and consistent across all guides.

```markdown
- [ ] **Brief label** -- Expanded description if needed
```

| Component   | Purpose                          | Example                         |
| ----------- | -------------------------------- | ------------------------------- |
| Checkbox    | Enables tracking completion      | `- [ ]`                         |
| Bold label  | Scannable identifier (2-4 words) | `**Clear scope**`               |
| Em-dash     | Visual separator                 | `--` (space-emdash-space)       |
| Description | Clarifies what the label means   | `First paragraph defines scope` |

### Quality Criteria

Items must be:

- **Verifiable** -- binary yes/no, no subjective terms like "good" or "proper"
- **Atomic** -- one concern per item, no compound requirements
- **Complete** -- every requirement in prose has a corresponding checklist item
- **Cohesive** -- all items in a checklist address the same concern

### Organization

Group items by concern. Avoid ordering by importance -- readers need all items.

**Cohesion over count.** A cohesive 3-item checklist is better than a 7-item
checklist mixing concerns. If a checklist name would be "X and Y" where X and Y
are distinct concerns, split them into separate checklists.

**Splitting guideline.** When a checklist grows beyond 9 items, consider
splitting into subsections by natural concern groupings.

### Common Pitfalls

| Pitfall                | Example                                 | Problem                             |
| ---------------------- | --------------------------------------- | ----------------------------------- |
| Compound items         | "Has title and description"             | Two requirements, one checkbox      |
| Vague verbs            | "Ensure code quality"                   | Unverifiable                        |
| Meta-instructions      | "Follow the guidelines above"           | Not self-contained                  |
| Redundant items        | "Uses em-dash" + "Has proper separator" | Same requirement twice              |
| Process, not outcome   | "Review the implementation"             | Describes activity, not requirement |
| Negative without scope | "Avoid errors"                          | Too broad to verify                 |

### Checklist Design Checklist

- [ ] **Checkbox prefix** -- Item starts with `- [ ]`
- [ ] **Bold label** -- Label is 2-4 words in bold
- [ ] **Em-dash separator** -- Uses `--` between label and description
- [ ] **One sentence max** -- Description doesn't exceed one sentence
- [ ] **Binary assessment** -- Each item answerable with yes/no
- [ ] **No subjective terms** -- Avoids "good," "proper," "appropriate"
- [ ] **No compound items** -- Each item tests exactly one requirement
- [ ] **Cohesive scope** -- All items address the same concern
- [ ] **Prose coverage** -- Every requirement in prose has a checklist item

---

## Prose Guidelines

Prose provides context that helps readers understand _why_ requirements exist.
It should never restate what is already in a checklist.

### Example: Context Without Duplication

```markdown
## Frontmatter

Frontmatter helps agents quickly assess document relevance without reading the
full content. Status indicates reliability; description explains when to consult
the document.

### Frontmatter Checklist

- [ ] **Has status** -- One of: placeholder, draft, active, deprecated
- [ ] **Has description** -- Answers "when should I read this?"
- [ ] **YAML valid** -- Parses without errors
```

The prose explains _why_ frontmatter matters. The checklist specifies _what_ is
required. No overlap.

### Prose Checklist

- [ ] **Explains rationale** -- Answers "why does this requirement exist?"
- [ ] **Provides context** -- Clarifies when guidance applies
- [ ] **Includes examples** -- Shows code, before/after, or comparisons
- [ ] **Links resources** -- References related documentation
- [ ] **No checklist restatement** -- Never repeats checklist items in prose
- [ ] **No standalone guidance** -- Every requirement has a checklist item

---

## Cross-Guide Boundaries

The single-source principle applies across guides, not just within them. Each
guide owns a specific domain; when guides overlap, information drifts.

### Overlap Signals

These patterns indicate problematic duplication:

- Same comparison table appears in multiple guides
- Same "why this matters" explanation in different places
- Checklist items that could reasonably live in either guide
- Updating one concept requires changes to multiple guides
- Two guides give slightly different advice on the same topic

### Resolution Approaches

| Overlap Type             | Resolution                                          |
| ------------------------ | --------------------------------------------------- |
| Duplicated rationale     | Keep in one guide, reference from others            |
| Shared comparison table  | Move to most relevant guide, link from others       |
| Ambiguous item ownership | Assign to guide closer to the concept's core domain |
| Boundary unclear         | Clarify scope in both guides' opening paragraphs    |

### Cross-Guide Boundaries Checklist

- [ ] **Owns its domain** -- Topics covered belong to this guide, not another
- [ ] **Minimal dependencies** -- Understandable without reading other guides
- [ ] **No duplicated rationale** -- "Why" explanations from other guides are
      referenced, not restated
- [ ] **No shared tables** -- Comparison/reference tables appear in one guide
      only
- [ ] **References actionable** -- Links to other guides point to specific
      sections
- [ ] **Overlap resolved** -- When duplication found, content consolidated to
      one guide

---

## External Documentation References

Guides that cover third-party libraries, APIs, or tools should reference
official documentation rather than duplicating it.

### Why Reference, Don't Replicate

| Aspect      | Our Guides         | External Docs         |
| ----------- | ------------------ | --------------------- |
| Expertise   | Our usage patterns | Full API surface      |
| Maintenance | Our update cycle   | Their release cycle   |
| Authority   | How we use it      | How it works          |
| Freshness   | May lag releases   | Current with releases |

Our guides explain _how we use_ a tool -- our patterns, conventions, and
integration decisions. External docs explain _how it works_ -- full API surface,
all options, comprehensive examples.

### What's Appropriate

**Reference external docs for:**

- API reference and method signatures
- Installation and setup procedures
- Complete feature lists and comparisons
- Version-specific details and migration guides

**Include in guides:**

- Examples that illustrate _our_ patterns (not comprehensive API usage)
- Rationale for _why_ we chose this tool or approach
- Integration with our stack and conventions
- Quick reference for commonly used patterns in our codebase

### External Documentation Checklist

- [ ] **Links to official docs** -- Guides reference canonical documentation for
      APIs and libraries used
- [ ] **Examples serve guidance** -- Code examples illustrate our patterns, not
      comprehensive API usage
- [ ] **No duplicated references** -- API signatures, feature lists, and
      comparisons link out rather than restate
- [ ] **Our patterns explained** -- Focus on why and how we use the tool, not
      how it works in general

---

## Guide Quality Checklist

Use this meta-checklist when creating or reviewing guides. It references the
section-specific checklists above rather than duplicating their items.

### Section Checklists Verified

- [ ] **Core Principle Checklist** -- All items pass
- [ ] **Guide Structure Checklist** -- All items pass
- [ ] **Checklist Design Checklist** -- All items pass
- [ ] **Prose Checklist** -- All items pass
- [ ] **Cross-Guide Boundaries Checklist** -- All items pass
- [ ] **External Documentation Checklist** -- All items pass

### Overall Structure

- [ ] **Single topic** -- Guide covers one coherent subject
- [ ] **Clear scope** -- First paragraph defines what's covered and what's not
- [ ] **Logical sections** -- Topics flow naturally, related items grouped
- [ ] **Frontmatter complete** -- Has status and description
- [ ] **Follows doc guidelines** -- Consistent with
      [Documentation Guidelines](./documentation-guidelines.md)
