---
type: Guide
title: Pattern guide
description: How to mine, write, review, and maintain a pattern document whose context, forces, solution, consequences, evidence, and relationships support safe adaptation.
tags: [docs, pattern, pattern-library, guide, authoring, evidence, review]
status: stable
sources:
  - id: patterns-faq
    resource: https://gee.cs.oswego.edu/dl/pd-FAQ/pd-FAQ.html
    title: Patterns-discussion FAQ
  - id: pattern-writing-language
    resource: https://www.hillside.net/index.php/a-pattern-language-for-pattern-writing
    title: Meszaros and Doble — A Pattern Language for Pattern Writing
  - id: fowler-writing-patterns
    resource: https://martinfowler.com/articles/writingPatterns.html
    title: Martin Fowler — Writing Software Patterns
  - id: azure-cloud-patterns
    resource: https://learn.microsoft.com/en-us/azure/architecture/patterns/
    title: Microsoft Azure Architecture Center — Cloud design patterns
  - id: govuk-pattern
    resource: https://design-system.service.gov.uk/patterns/check-a-service-is-suitable/
    title: GOV.UK Design System — Check a service is suitable
  - id: va-maturity
    resource: https://design.va.gov/about/maturity-scale
    title: VA Design System — Maturity scale
generated: { by: "codex/gpt-5.6", at: 2026-08-15T16:02:55Z }
---

# Pattern guide

Mine and write a pattern so another practitioner can recognize a recurring
problem, judge whether the solution fits, understand its tradeoffs, and create
a locally appropriate realization. For what makes the form distinct, read
[Pattern explainer](../explainers/pattern.md).

## Goal

Publish an honestly matured, skimmable pattern whose solution is reusable
because its invariant, context, forces, consequences, evidence, and
relationships are clear — not because readers are expected to copy one
example.

## Preconditions

- Several observed occurrences or an explicit decision to publish a candidate
  rather than claim an established pattern
- Enough domain knowledge to distinguish essential structure from incidental
  implementation
- Access to practitioners, records, research, or artifacts that can support
  the evidence claim
- A real audience that encounters the problem and can apply the solution
- A host location with ownership and lifecycle conventions, if the pattern
  will join a maintained library

## Steps

1. **Mine before naming.** Gather independent occurrences of the apparent
   solution and the situations that prompted it. Search existing literature
   for the same or overlapping patterns. Do not create a new name merely
   because local terminology differs.

2. **Separate instances from the invariant.** Compare the occurrences. Mark
   what remains stable, what varies with context, and what is merely an
   implementation detail. The reusable core must be specific enough to
   construct yet broad enough to admit the observed variation.

3. **State context and problem independently.** Describe the recurring
   circumstances, then the tension that exists within them. A reader should be
   able to recognize the problem before seeing or agreeing with the solution.
   Begin from a constraint, risk, or goal conflict — not from a preferred
   technology.

4. **Surface the forces.** Name the competing goals, constraints, pressures,
   and attractive alternatives that make the problem non-trivial. Include
   forces the solution only partially resolves. If there is no meaningful
   tension, the advice may be a rule, [principle](../explainers/principle.md),
   or simple how-to rather than a pattern.

5. **Write the solution core.** State the essential arrangement as a
   constructive instruction. Describe structure and, when needed, important
   dynamics. Do not prescribe choices that the context should determine. Move
   platform-specific commands, complete code, and procedural detail to linked
   how-tos or examples.

6. **Trace consequences and resulting context.** Explain how the solution
   resolves each important force, where it compromises, what liabilities it
   introduces, and which new problems now appear. This section is a decision
   aid, not a benefits pitch.

7. **Make applicability rejectable.** State observable indications, necessary
   preconditions, and explicit _when not to use_ conditions. Compare the
   nearest alternatives by the forces that make each one preferable. A reader
   should be able to reject the pattern without reading implementation notes.

8. **Calibrate the evidence claim.** Record real known uses, research, peer
   review, or other observations. Test whether apparently separate uses share
   one origin. Use three independent occurrences as a recurrence heuristic,
   not a mechanical gate. When evidence is insufficient, label the entry as a
   candidate or proto-pattern.

9. **Add examples without turning them into the rule.** Use a diagram, worked
   example, or implementation sketch when it makes the invariant easier to
   see. Label synthetic examples as illustrative. Name which details realize
   the pattern and which are local choices.

10. **Map relationships by role.** Identify patterns that establish this
    context, solve resulting problems, offer alternatives, complement the
    solution, specialize or generalize it, or conflict with it. Write the
    relationship in prose; a bare _Related_ list does not help readers compose
    a design.

11. **Write for two reading depths.** Make the name, intent, problem, and
    solution scannable as a catalog thumbnail. Put context and forces where a
    reader can test fit next. Keep rationale, examples, evidence, and detailed
    relations in clearly named sections that a committed reader can enter
    without slowing the first scan.

12. **Review the relation, not only the prose.** Ask a domain practitioner to
    challenge recurrence, forces, evidence, and contraindications. Ask a
    less-familiar practitioner whether the entry supports recognition and a
    fresh realization. Revise the pattern when either reader has to infer the
    problem or copy the example.

13. **Integrate and maintain it.** Add an intent thumbnail to the catalog,
    classify it by reader-recognizable problems or forces, assign an owner and
    maturity, and connect it to the existing collection. Revisit evidence and
    applicability as conditions change. Deprecate with a replacement path
    rather than deleting an entry readers may still encounter.

## Draft shape

Use the host's conventions. This is a drafting aid, not a required schema:

```markdown
# Evocative pattern name

One sentence naming the intent or solution core.

## Context

## Problem

## Forces

## Solution

## Consequences

## When to use

## When not to use

## Evidence and known uses

## Related patterns
```

Combine or reorder sections when narrative flow improves, but keep the
problem, solution, and fit easy to locate. Optional sections include aliases,
indications, rationale, variants, examples, diagrams, implementation notes,
and sources.

## Evidence discipline

- **Known use** means an observed realization, not a hypothetical example.
- **Independent** means the use was not merely copied from the same source.
- **Successful** means evidence supports the claimed force resolution, not
  that the system happened to ship.
- **Reviewed** means another person challenged the pattern claim, not merely
  edited its grammar.
- **Candidate** is an honest lifecycle state, not a failed pattern.

Record enough provenance for later maintainers to reassess the claim. Do not
include private evidence in a public pattern; either cite a publishable source,
use an intentionally synthetic example without presenting it as evidence, or
keep the candidate private until its public case stands on its own.

## Library integration

For a maintained library:

- expose a one- or two-sentence **intent thumbnail** in the index;
- support problem-first browsing rather than technology-only categories;
- use consistent scan-critical elements across entries;
- distinguish candidate, established, and deprecated guidance visibly;
- typed relationships such as _alternative to_ or _followed by_;
- keep known uses, research, issues, and contribution routes discoverable;
  and
- claim a **pattern language** only when relationships or sequences help
  readers build coherent larger solutions.

## Review checks

- Can the intended reader recognize the context and problem before seeing the
  answer?
- Do the forces make the solution and its alternatives intelligible?
- Is the solution an invariant across known uses rather than a disguised copy
  of one?
- Can a reader construct a new realization without environment-specific steps
  crowding the pattern?
- Are liabilities and contraindications as visible as benefits?
- Does evidence justify the maturity label?
- Do relationship links explain how the patterns interact?
- Can a library browser understand the entry from its thumbnail, then deepen
  selectively?

## Pitfalls while authoring

The [Pattern explainer](../explainers/pattern.md#failure-modes-common) owns the
form's failure-mode taxonomy. Catch these production hazards in particular:

- **Naming too early** — the memorable label hardens a weak abstraction before
  instances have been compared.
- **Forces after the fact** — rationale is invented to defend a solution rather
  than recovered from the situations that produced it.
- **Evidence leakage** — private projects, customer details, or unpublished
  incidents are included to make a public pattern appear established.
- **Template expansion** — optional headings are filled with repetition because
  the author mistakes completeness of form for strength of claim.
- **Library dumping** — the page is added without an intent thumbnail,
  relationship, maturity signal, or owner.

## Done when

The entry can be skimmed, selected, rejected, and read deeply; its solution is
constructive without collapsing into one implementation; its maturity matches
its evidence; its examples are distinguishable from known uses; its
relationships are meaningful; and the host library can maintain or deprecate
it.

## Related

- [Pattern explainer](../explainers/pattern.md)
- [Principle explainer](../explainers/principle.md) · [Principle guide](principle.md)
- [Documentation craft guide](documentation-craft.md)
- [Reference guide](reference.md)
- [Explanation guide](explanation.md)
- [How-to guide](how-to.md)
