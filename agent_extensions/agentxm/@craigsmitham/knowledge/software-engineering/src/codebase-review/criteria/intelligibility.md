---
type: Checklist
title: Intelligibility quality criteria
description: Use when assessing whether qualified maintainers can form an accurate, coherent, and appropriately bounded mental model of the product.
tags: [codebase-review, software-quality, intelligibility, comprehensibility, conceptual-integrity, reporting-review]
status: draft
sources:
- id: dijkstra
  resource: https://www.cs.utexas.edu/~EWD/transcriptions/EWD02xx/EWD249/EWD249.html
  title: Notes on Structured Programming
- id: parnas
  resource: https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html
  title: On the Criteria To Be Used in Decomposing Systems into Modules
- id: brooks
  resource: https://soloway.pbworks.com/f/The.Mythical.Man.Month.F.Brooks.pdf
  title: The Mythical Man-Month — Essays on Software Engineering, Anniversary Edition
- id: google-review
  resource: https://google.github.io/eng-practices/review/reviewer/looking-for.html
  title: What to look for in a code review
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
---

# Intelligibility quality criteria

Use this list to judge whether qualified maintainers can form an accurate,
coherent, and bounded mental model of the product's concepts, responsibilities,
behavior, state, effects, and constraints. The desired outcome is
comprehension—not conformance to a preferred style, file size, abstraction
count, documentation volume, or complexity threshold. Dijkstra's separation
of concerns, Parnas's information hiding, and Brooks's conceptual integrity
motivate this direct treatment of human understanding.[^dijkstra][^parnas][^brooks]

This is a candidate `reporting-review` checklist. Apply the shared assessment
states and evidence rules in [Reviewing a
codebase](../reviewing-a-codebase.md). The pillar definition and neighbor
boundaries are in [Software quality
pillars](../software-quality-pillars.md); the typed relationships below use
[Cross-cutting concerns for software quality](../cross-cutting-concerns.md).

## Default cross-cutting relationships

`XC-01` Claim context constrains every criterion through maintainer knowledge,
task, scope, consequence, and available representations. `XC-08` Evidence must
qualify every judgment. Unless a criterion says otherwise, these list-level
defaults apply:

| Concern | Default relationship to Intelligibility |
| --- | --- |
| `XC-02` Specification | `(EN·EV)` — can preserve domain meaning, contracts, and constraints needed for an accurate model. |
| `XC-03` Structure | `CTR` — boundaries, dependency, state, authority, and complexity can concentrate or scatter meaning. |
| `XC-04` Lifecycle integrity | `EN·EV` — history, versions, generated sources, and provenance can explain the operative product state. |
| `XC-05` Risk | `TH·CS·TR` — critical reasoning tasks and the cost of misunderstanding condition the claim. |
| `XC-06` Assurance | `EN·EV` — representative comprehension tasks and review can support a bounded judgment. |
| `XC-07` Feedback | `EN·EV` — diagnostics, incidents, and change experience can expose mismatches in the maintainer model. |

## Criteria

### INT-01 — Conceptual coherence

**Outcome question:** Can qualified maintainers form one
consistent model of the product's essential domain concepts and their
relationships?[^brooks]

**Why it matters:** contradictory or competing conceptual models force each
maintainer to reconstruct meaning and make locally plausible but globally
inconsistent decisions.

**Applicability:** apply at the smallest scope that claims a coherent product
concept; independently governed subsystems can legitimately use different
models when their relationship is explicit.

**Boundary:** this criterion owns coherence of the maintainer model.
Suitability owns whether the concepts address stakeholder needs; Correctness
owns whether behavior conforms to accepted contracts.

### INT-02 — Terminological coherence

**Outcome question:** Can qualified maintainers distinguish and consistently
apply each material domain term within its relevant scope?[^brooks][^google-review]

**Why it matters:** synonyms, homonyms, and unexplained renaming conceal
whether code refers to the same or different concepts.

**Applicability:** judge semantic consistency rather than spelling, casing,
language, or length preference. Different bounded contexts may intentionally
use different terms.

**Boundary:** this criterion owns the language of the mental model.
Compatibility owns whether external participants agree on exchanged meaning;
`XC-02` Specification can provide terminological authority.

### INT-03 — Responsibility legibility

**Outcome question:** Can qualified maintainers identify the canonical owner of
each material product responsibility?[^parnas]

**Why it matters:** unclear ownership causes missed changes, duplicated rules,
and contradictory fixes even when individual units look simple.

**Applicability:** an owner can be a module, service, type, process, data
authority, generated source, or another semantic unit; directory layout alone
is not a verdict.

**Boundary:** this criterion owns understanding of responsibility. `XC-03`
Structure owns whether responsibility is actually concentrated effectively;
Evolvability owns the resulting change burden.

### INT-04 — Boundary legibility

**Outcome question:** Can qualified maintainers determine which obligations and
details cross each relevant product boundary?[^parnas]

**Why it matters:** hidden or porous boundaries make local reasoning
unreliable because unseen obligations can invalidate an apparently safe
conclusion.

**Applicability:** apply to boundaries material to the reviewed task or
claim. A product need not expose every implementation detail to every
maintainer.

**Boundary:** this criterion owns comprehension of boundaries. `XC-03`
Structure owns their design quality; Security and Compatibility own outcomes
at particular trust and integration boundaries.

### INT-05 — Dependency legibility

**Outcome question:** Can qualified maintainers determine
what each relevant product element relies on and what relies on it, including
nonlocal runtime and data relationships?[^parnas]

**Why it matters:** invisible dependencies defeat bounded reasoning and allow
a local change to have surprising distant consequences.

**Applicability:** apply beyond textual imports where configuration,
registration, generation, shared data, callbacks, or external services create
material semantic reliance.

**Boundary:** this criterion owns understanding of dependency. Evolvability
owns whether dependencies make change disproportionate; Lifecycle integrity
owns dependency identity and resolution control.

### INT-06 — Behavior legibility

**Outcome question:** Can qualified maintainers explain the causal path from a
relevant stimulus to its declared result?[^dijkstra][^google-review]

**Why it matters:** code that can be read line by line may still conceal the
causal story needed to predict or change its behavior.

**Applicability:** scope the path to a representative maintainer task. Dynamic
dispatch, generation, asynchronous work, and configuration do not fail the
criterion merely because they require additional evidence.

**Boundary:** this criterion owns comprehension of behavior. Correctness owns
whether that behavior conforms; `INT-07` and `INT-08` own state and external
effect models specifically.

### INT-07 — State legibility

**Outcome question:** Can qualified maintainers identify the
relevant state, its owner, its valid forms, and the transitions that can
change it?[^dijkstra]

**Why it matters:** implicit, duplicated, or ambiguously owned state makes
present behavior and future consequences difficult to predict.

**Applicability:** apply to persistent, in-memory, distributed, cached,
configuration, and workflow state relevant to the claim. Stateless scopes
may mark it `Not applicable`.

**Boundary:** this criterion owns the maintainer's state model. Correctness
owns invariant and transition conformance; `XC-03` Structure owns state
placement and authority.

### INT-08 — Effect legibility

**Outcome question:** Can qualified maintainers identify every
material external or irreversible effect a relevant operation may cause and
the boundary that owns it?[^google-review]

**Why it matters:** concealed I/O, mutation, communication, authority use, or
resource ownership makes apparently local reasoning unsafe.

**Applicability:** apply to effects material to the task and consequence.
Common language conventions can provide adequate legibility when they are
consistently understood by qualified maintainers.

**Boundary:** this criterion owns comprehension of effects. Correctness owns
whether effects match the contract; Security owns whether they are
authorized.

### INT-09 — Rationale visibility

**Outcome question:** Can qualified maintainers recover the
material reason for a non-obvious constraint, tradeoff, exception, or design
decision?[^brooks][^google-review]

**Why it matters:** unexplained decisions look accidental and are easily
removed, duplicated, or contradicted during later change.

**Applicability:** apply where the reason cannot be derived reliably from the
operative behavior and accepted specification. The rationale may live in
code, history, decisions, tests, or another attributable source.

**Boundary:** this criterion owns recoverability of design intent. `XC-02`
Specification owns governing obligations; `XC-08` Evidence owns the currency
and attribution of the rationale source.

### INT-10 — Reasoning boundedness

**Outcome question:** Can qualified maintainers answer an in-scope product
question without understanding unrelated product detail?[^dijkstra][^parnas][^brooks]

**Why it matters:** local reasoning fails when unrelated concepts, state, and
dependencies must be loaded before a bounded question can be answered.

**Applicability:** scope the maintainer question and the detail genuinely needed
to answer it. File length, path count, abstraction count, clone detection, or a
complexity number is only a navigation signal.

**Boundary:** this criterion owns the ability to reason within a bounded scope.
`XC-03` Structure owns design contributors; Evolvability owns the resulting
change cost, risk, and delay.

Completion means every applicable criterion has one assessment state and a
claim-bound record under [Reviewing a codebase](../reviewing-a-codebase.md).
Completion does not prove universal comprehensibility; maintainer expertise,
task, scope, and evidence limits remain part of every claim.

[^dijkstra]: Dijkstra, [Notes on Structured Programming](https://www.cs.utexas.edu/~EWD/transcriptions/EWD02xx/EWD249/EWD249.html).
[^parnas]: Parnas, [On the Criteria To Be Used in Decomposing Systems into Modules](https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html).
[^brooks]: Brooks, [The Mythical Man-Month, anniversary edition](https://soloway.pbworks.com/f/The.Mythical.Man.Month.F.Brooks.pdf).
[^google-review]: Google, [What to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html).
