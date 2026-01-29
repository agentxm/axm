---
status: active
description:
  When creating or reviewing a guide in docs/guides/; covers structure,
  checklists, prose style, and referencing external documentation.
---

# Guide Authoring

Standards for writing guides that serve as authoritative references for both
humans and agents. After reading, you should be able to create guides that pass
the [Guide Quality Checklist](#guide-quality-checklist). Covers structure,
checklists, prose style, and referencing external documentation. Does not cover
content research, publication workflows, or tooling.

---

## Quick Example

_Illustrates: "Single source," "Checklist authority," "Standard format," and
"Descriptive checklist names"_

_Before_ — A guide section that mixes prose and checklist:

```markdown
## Error Handling

Always use Result types. Don't throw exceptions. Log errors with context. Use
structured error codes.

### Checklist

- [ ] Use Result types
- [ ] Don't throw exceptions
```

_After_ — Prose explains why; checklist specifies what:

```markdown
## Error Handling

Result types make error paths explicit and composable. They prevent the
"exception surprise" where callers don't know what can fail.

### Error Handling Checklist

- [ ] **Result types** — Use Result<T, E> instead of throwing exceptions
- [ ] **Structured codes** — Errors include machine-readable codes
- [ ] **Contextual logging** — Log includes operation context, not just message
```

The before example duplicates guidance between prose and checklist. The after
example separates concerns: prose explains _why_, checklist specifies _what_.

---

## At a Glance

For experienced authors needing a quick refresher, verify against:

- [Guides and Skills Checklist](#guides-and-skills-checklist) — skill references,
  no tactical duplication
- [Core Principle Checklist](#core-principle-checklist) — single source,
  checklist authority
- [Guide Structure Checklist](#guide-structure-checklist) — section endings,
  naming
- [Cross-Guide Boundaries Checklist](#cross-guide-boundaries-checklist) — no
  duplication across guides
- [Guide Quality Checklist](#guide-quality-checklist) — final verification

---

## Guides vs Skills

Guides and [skills](https://code.claude.com/docs/en/skills) serve complementary
roles. Understanding when to use each prevents duplication and ensures
appropriate depth.

| Aspect         | Guides                           | Skills                            |
| -------------- | -------------------------------- | --------------------------------- |
| **Purpose**    | Cohesive, high-level guidance    | Tactical, actionable patterns     |
| **Content**    | Rationale, concepts, when-to-use | How-to, code patterns, checklists |
| **Depth**      | Comprehensive reference          | Focused, task-specific            |
| **Loading**    | Manual (read on demand)          | Auto-loaded when relevant         |
| **Standalone** | References skills for tactics    | Self-contained, no external refs  |

### When Content Belongs in a Skill

Move content to a skill when it's:

- Directly actionable (copy-paste patterns, checklists)
- Needed during specific tasks (writing tests, designing services)
- Better served by auto-loading than manual lookup

### Referencing Skills from Guides

When a guide covers a topic that has a corresponding skill, reference the skill
for tactical details rather than duplicating them:

```markdown
For implementing retry policies, see the `/effect-service` skill which provides
ready-to-use patterns.
```

This keeps guides focused on the "what" and "why" while skills handle the "how."

### Guides and Skills Checklist

- [ ] **No tactical duplication** — Tactical patterns live in skills, not guides
- [ ] **Skills referenced** — Guides point to relevant skills for actionable
      patterns
- [ ] **Rationale in guides** — Conceptual explanations and rationale stay in
      guides
- [ ] **Clear handoff** — Reference explains what the skill provides

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

For artifact selection criteria, see
[Documentation Guidelines](documentation-guidelines.md).

### When to Create a Guide Checklist

- [ ] **Cross-cutting scope** — Topic applies across multiple directories or
      packages
- [ ] **Reference purpose** — Content serves as ongoing reference, not one-time
      explanation
- [ ] **Not directory-specific** — Conventions aren't limited to a single
      package
- [ ] **Recurring patterns** — Guidance addresses patterns that appear in
      multiple contexts

---

## Core Principle: Checklists as Authority

Checklists are the authoritative reference for verifiable requirements. Prose
supports checklists—it never duplicates them.

### Why Checklists First

| Aspect        | Checklist                       | Prose                                |
| ------------- | ------------------------------- | ------------------------------------ |
| Scannability  | ✅ Instantly scannable          | ❌ Requires reading                  |
| Completeness  | ✅ Exhaustive, nothing missed   | ❌ Easy to miss items buried in text |
| Verifiability | ✅ Yes/no assessment            | ❌ Subjective interpretation         |
| Agent use     | ✅ Direct instruction following | ❌ Requires extraction               |
| Maintenance   | ✅ Easy to audit and update     | ❌ Duplication drifts                |

### The Duplication Problem

When guidance appears both as prose and in a checklist:

- Updates happen in one place, not both → information drifts
- Readers see the same thing twice → wastes attention
- Agents may get conflicting versions → unreliable behavior

### Core Principle Checklist

- [ ] **Single source** — Guidance appears in checklist OR prose, never both
- [ ] **Checklist authority** — Verifiable requirements live in checklists, not
      prose
- [ ] **Prose references** — Prose points to checklists ("see X checklist")
      rather than restating items

---

## Guide Structure Pattern

_Template illustrating: "Ends with checklist," "Context explains why," "Examples
illustrate," and "Frontmatter complete"_

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
to do—that's what the checklist is for.

### Examples (when helpful)

Concrete examples illustrating checklist items. Reference which items they
demonstrate.

### [Topic] Checklist

- [ ] **Item name** — Concise requirement statement
- [ ] **Another item** — Another requirement
```

### Section Anatomy

| Component     | Purpose                                | Required |
| ------------- | -------------------------------------- | -------- |
| Context       | Explain _why_ (not _what_)             | Optional |
| Examples      | Illustrate checklist items             | Optional |
| Tables        | Reference data, comparisons, options   | Optional |
| **Checklist** | Authoritative, verifiable requirements | Required |

### Guide Structure Checklist

- [ ] **Ends with checklist** — Every substantive section concludes with a
      checklist
- [ ] **Descriptive checklist names** — Headers include topic (e.g., "Error
      Handling Checklist" not just "Checklist")
- [ ] **Focused scope** — Each checklist covers one concern; never combine
      topics to reach an item count
- [ ] **No orphan sections** — Sections without checklists are merged,
      converted, or removed
- [ ] **Context explains why** — Context subsections explain rationale, not
      requirements
- [ ] **Examples illustrate** — Examples reference which checklist items they
      demonstrate

---

## Checklist Design

Best practices for writing checklists that serve as authoritative, verifiable
requirements within guides.

### Item Format

The standard format makes items scannable and consistent across all guides.

```markdown
- [ ] **Brief label** — Expanded description if needed
```

| Component   | Purpose                          | Example                         |
| ----------- | -------------------------------- | ------------------------------- |
| Checkbox    | Enables tracking completion      | `- [ ]`                         |
| Bold label  | Scannable identifier (2-4 words) | `**Clear scope**`               |
| Em-dash     | Visual separator                 | `—` (space-emdash-space)        |
| Description | Clarifies what the label means   | `First paragraph defines scope` |

#### Item Format Checklist

- [ ] **Checkbox prefix** — Item starts with `- [ ]`
- [ ] **Bold label** — Label is 2-4 words in bold
- [ ] **Verb or noun start** — Label starts with a verb or noun, not an article
- [ ] **Em-dash separator** — Uses `—` (space-emdash-space) between label and
      description
- [ ] **One sentence max** — Description doesn't exceed one sentence
- [ ] **No trailing period** — Description omits final period

### Essential Quality

Items must be verifiable (binary yes/no), cohesive (one concern per checklist),
complete (covering all prose requirements), and free of common pitfalls. See
[Checklist Design Reference](#checklist-design-reference) for detailed guidance,
examples, and complete checklists.

#### Essential Quality Checklist

- [ ] **Binary assessment** — Each item answerable with yes/no
- [ ] **No subjective terms** — Avoids "good," "proper," "appropriate"
- [ ] **No compound items** — Each item tests exactly one requirement
- [ ] **Cohesive scope** — All items address the same concern; never combine
      unrelated topics
- [ ] **Prose coverage** — Every requirement in prose has a checklist item

---

## Prose Guidelines

Prose provides context that helps readers understand _why_ requirements exist.
See Prose Checklist for what prose should and shouldn't do.

### Example: Context Without Duplication

_Illustrates: "Explains rationale," "No checklist restatement," and "No
standalone guidance"_

```markdown
## Frontmatter

Frontmatter helps agents quickly assess document relevance without reading the
full content. Status indicates reliability; description explains when to consult
the document.

### Frontmatter Checklist

- [ ] **Has status** — One of: placeholder, draft, active, deprecated
- [ ] **Has description** — Answers "when should I read this?"
- [ ] **YAML valid** — Parses without errors
```

Note: The prose explains _why_ frontmatter matters. The checklist specifies
_what_ is required. No overlap.

### Prose Checklist

- [ ] **Explains rationale** — Answers "why does this requirement exist?"
- [ ] **Provides context** — Clarifies when guidance applies
- [ ] **Includes examples** — Shows code, before/after, or comparisons
- [ ] **Links resources** — References related documentation
- [ ] **No checklist restatement** — Never repeats checklist items in prose
- [ ] **No prose instructions** — Instructions live in checklists, not prose
- [ ] **No standalone guidance** — Every requirement has a checklist item

---

## Cross-Guide Boundaries

The single-source principle applies across guides, not just within them. Each
guide owns a specific domain; when guides overlap, information drifts.

### Why Boundaries Matter

Cross-guide duplication causes the same problems as prose/checklist duplication:

- Updates happen in one guide, not all → versions diverge
- Readers encounter the same explanation twice → unclear which is authoritative
- Agents may receive conflicting guidance → unreliable behavior

### Cohesion Over Coupling

Guides should be highly cohesive—focused on one topic that can be understood
without reading other guides. See the Cross-Guide Boundaries Checklist for
specific requirements on dependencies and prerequisites.

### Reference, Don't Restate

When a guide touches concepts from another guide's domain:

| Instead of...                    | Do this...                            |
| -------------------------------- | ------------------------------------- |
| Restating rationale              | Link: "see [Guide] for why"           |
| Duplicating a comparison table   | Reference: "see [Guide]'s comparison" |
| Re-explaining foundational ideas | Assume knowledge or link to source    |
| Copying checklist items          | Reference the authoritative checklist |

A guide can reference another while remaining self-contained. Include enough
context to be actionable; link to other guides for deeper rationale.

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

- [ ] **Owns its domain** — Topics covered belong to this guide, not another
- [ ] **Minimal dependencies** — Understandable without reading other guides
- [ ] **Single-guide completion** — Reader can complete related tasks using this
      guide alone
- [ ] **Knowledge prerequisites** — Background needed is domain knowledge, not
      other guides
- [ ] **No duplicated rationale** — "Why" explanations from other guides are
      referenced, not restated
- [ ] **No shared tables** — Comparison/reference tables appear in one guide
      only
- [ ] **References actionable** — Links to other guides point to specific
      sections
- [ ] **Overlap resolved** — When duplication found, content consolidated to one
      guide

---

## External Documentation References

Guides that cover third-party libraries, APIs, or tools should reference
official documentation rather than duplicating it. External documentation is
maintained by domain experts, updated with each release, and serves as the
authoritative source for how something works.

### Why Reference, Don't Replicate

| Aspect      | Our Guides         | External Docs         |
| ----------- | ------------------ | --------------------- |
| Expertise   | Our usage patterns | Full API surface      |
| Maintenance | Our update cycle   | Their release cycle   |
| Authority   | How we use it      | How it works          |
| Freshness   | May lag releases   | Current with releases |

Our guides explain _how we use_ a tool—our patterns, conventions, and
integration decisions. External docs explain _how it works_—full API surface,
all options, comprehensive examples.

### What's Appropriate

**Reference external docs for:**

- API reference and method signatures
- Installation and setup procedures
- Complete feature lists and comparisons
- Version-specific details and migration guides
- Edge cases and advanced usage beyond our patterns

**Include in guides:**

- Examples that illustrate _our_ patterns (not comprehensive API usage)
- Rationale for _why_ we chose this tool or approach
- Integration with our stack and conventions
- Quick reference for commonly used patterns in our codebase

### Example: Appropriate vs Duplicative

_Duplicative—restates external docs:_

```markdown
## Effect Configuration

Effect provides configuration through the Config module. Config values can be:

- Config.string(name) — reads a string value
- Config.number(name) — reads a numeric value
- Config.boolean(name) — reads a boolean value
- Config.secret(name) — reads a sensitive value [continues with full API...]
```

_Appropriate—explains our usage, links for details:_

> ## Effect Configuration
>
> We use Effect's Config module for all configuration (see
> [Effect Config docs](https://effect.website/docs/configuration)).
>
> Our convention: define configs in a dedicated `config.ts` file per package:
>
> ```typescript
> const AppConfig = Config.all({
>   port: Config.number("PORT").pipe(Config.withDefault(3000)),
>   dbUrl: Config.secret("DATABASE_URL"),
> });
> ```
>
> See [Effect Service Design](effect-service-design.md) for integrating configs
> with services.

The duplicative example documents the API. The appropriate example explains our
convention and links to the source for API details.

### External Documentation Checklist

- [ ] **Links to official docs** — Guides reference canonical documentation for
      APIs and libraries used
- [ ] **Examples serve guidance** — Code examples illustrate our patterns, not
      comprehensive API usage
- [ ] **No duplicated references** — API signatures, feature lists, and
      comparisons link out rather than restate
- [ ] **Setup defers to source** — Installation and configuration references
      external docs
- [ ] **Version-awareness** — Version-specific details marked clearly or avoided
      when possible
- [ ] **Our patterns explained** — Focus on why and how we use the tool, not how
      it works in general

---

## Guide Quality Checklist

Use this meta-checklist when creating or reviewing guides. It references the
section-specific checklists above rather than duplicating their items.

### Section Checklists Verified

- [ ] **Core Principle Checklist** — All items in
      [Core Principle Checklist](#core-principle-checklist) pass
- [ ] **Guide Structure Checklist** — All items in
      [Guide Structure Checklist](#guide-structure-checklist) pass
- [ ] **Checklist Design checklists** — All items in
      [Item Format Checklist](#item-format-checklist) and
      [Essential Quality Checklist](#essential-quality-checklist) pass
- [ ] **Prose Checklist** — All items in [Prose Checklist](#prose-checklist)
      pass
- [ ] **Cross-Guide Boundaries Checklist** — All items in
      [Cross-Guide Boundaries Checklist](#cross-guide-boundaries-checklist) pass
- [ ] **External Documentation Checklist** — All items in
      [External Documentation Checklist](#external-documentation-checklist) pass
- [ ] **Guides and Skills Checklist** — All items in
      [Guides and Skills Checklist](#guides-and-skills-checklist) pass

### Overall Structure

- [ ] **Single topic** — Guide covers one coherent subject
- [ ] **Clear scope** — First paragraph defines what's covered and what's not
- [ ] **Logical sections** — Topics flow naturally, related items grouped

### Maintenance

- [ ] **Self-contained** — Doesn't require reading other docs to understand
- [ ] **Frontmatter complete** — Has status and description
- [ ] **Follows doc guidelines** — Consistent with
      [Documentation Guidelines](documentation-guidelines.md)

---

## Checklist Design Reference

Detailed guidance on checklist quality. For quick verification, use the
[Essential Quality Checklist](#essential-quality-checklist) above.

### Verifiability

A checklist item is only useful if someone can definitively answer "yes" or "no"
to whether it's satisfied. Vague items lead to inconsistent assessment.

| Vague (unverifiable)     | Verifiable (specific)                          |
| ------------------------ | ---------------------------------------------- |
| Write good documentation | H1 describes directory purpose                 |
| Be concise               | No sentence exceeds 25 words                   |
| Follow best practices    | Uses `catalog:` for all dependencies           |
| Make it readable         | Code blocks have language specifier            |
| Consider the audience    | Human-facing: complete sentences; agent: terse |
| Ensure quality           | All tests pass                                 |
| Handle errors properly   | Errors include error code and recovery action  |

#### Verifiability Checklist

- [ ] **Binary assessment** — Item can be assessed with yes/no answer
- [ ] **Specific criteria** — Item states exact requirement, not general goal
- [ ] **Observable outcome** — Compliance can be observed or measured
- [ ] **No subjective terms** — Avoids "good," "proper," "appropriate,"
      "readable"
- [ ] **No qualifiers** — Avoids "generally," "usually," "when possible"

### Organization

Group items by concern to help readers find related requirements. Avoid ordering
by importance—readers need all items, not just the "most important" ones.

| Category  | Contains                           | Example items                 |
| --------- | ---------------------------------- | ----------------------------- |
| Structure | Organization, sections, hierarchy  | "Every section has checklist" |
| Content   | What to include, required elements | "Has status field"            |
| Format    | Syntax, styling, presentation      | "Uses em-dash separator"      |
| Avoid     | Anti-patterns, common mistakes     | "No checklist restatement"    |

**Cohesion over count.** A cohesive 3-item checklist is better than a 7-item
checklist mixing concerns. Never combine unrelated topics to reach an item
target. If a checklist name would be "X and Y" where X and Y are distinct
concerns (e.g., "Responsive Design and Dark Mode Checklist"), split them into
separate checklists.

**Splitting guideline.** Working memory holds approximately 7±2 items. When a
checklist grows beyond 9 items, consider splitting into subsections by natural
concern groupings.

#### Organization Checklist

- [ ] **Cohesion primary** — Each checklist addresses one concern; if the name
      would be "X and Y" (distinct topics), split into separate checklists
- [ ] **Split large checklists** — Checklists with 10+ items split into
      subsections by natural groupings
- [ ] **Critical items early** — High-consequence items appear near checklist
      start
- [ ] **Grouped by concern** — Items grouped by category, not ranked by
      importance
- [ ] **Logical order** — Categories flow from general to specific
- [ ] **Parallel structure** — Items within a category use consistent phrasing

### Completeness

Ask: "Can someone verify full compliance using only this checklist?" If they
need to read surrounding prose to catch requirements, the checklist is
incomplete.

#### Completeness Checklist

- [ ] **Prose coverage** — Every requirement in surrounding prose has a
      checklist item
- [ ] **Standalone assessment** — Compliance verifiable using only the checklist
- [ ] **No forward references** — No item says "see above" or "follow
      guidelines"
- [ ] **No implicit requirements** — Nothing assumed or "obvious" is left
      unstated

### Common Pitfalls

| Pitfall                | Example                                 | Problem                             |
| ---------------------- | --------------------------------------- | ----------------------------------- |
| Compound items         | "Has title and description"             | Two requirements, one checkbox      |
| Vague verbs            | "Ensure code quality"                   | Unverifiable                        |
| Meta-instructions      | "Follow the guidelines above"           | Not self-contained                  |
| Redundant items        | "Uses em-dash" + "Has proper separator" | Same requirement twice              |
| Process, not outcome   | "Review the implementation"             | Describes activity, not requirement |
| Negative without scope | "Avoid errors"                          | Too broad to verify                 |

#### Pitfalls Checklist

- [ ] **No compound items** — Each item tests exactly one requirement
- [ ] **No vague verbs** — Avoids "ensure," "consider," "handle properly"
- [ ] **No meta-instructions** — Items don't reference other items or sections
- [ ] **No redundancy** — No two items test the same underlying requirement
- [ ] **Outcomes, not process** — Items describe results, not activities
- [ ] **Scoped negatives** — "Avoid X" items specify what X means

### Resources

- [The Checklist Manifesto (Summary)](https://www.samuelthomasdavies.com/book-summaries/health-fitness/the-checklist-manifesto/)
  — Atul Gawande's seminal work on checklist design
- [NASA/SKYbrary Checklist Research](https://skybrary.aero/articles/checklists)
  — Aviation checklist philosophy including the 5-9 item limit
- [Cognitive Load Theory](https://www.learningscientists.org/blog/2017/7/28-1) —
  Background on Miller's 7±2 and working memory constraints

---

## See Also

- `/documentation` skill — Templates and checklists for README.md and CLAUDE.md
- `/agent-docs` skill — Ultra-terse style patterns for agent-facing documentation
- [Documentation Guidelines](documentation-guidelines.md) — Broader documentation
  conventions
