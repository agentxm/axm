---
type: Principle
title: "YAGNI: defer speculative capability and structure"
description: Why capability and structure should be deferred until needed, preserving optionality and economic timing without neglecting present quality.
tags: [yagni, simple-design, incremental-design, speculative-generality, premature-abstraction, optionality, reversibility]
status: draft
sources:
  - id: beck-yagni-timing
    resource: https://newsletter.kentbeck.com/p/the-cost-yagni-was-never-about
    title: Kent Beck — The Cost YAGNI Was Never About
  - id: fowler-yagni
    resource: https://martinfowler.com/bliki/Yagni.html
    title: Martin Fowler — Yagni
  - id: fowler-xp-principles
    resource: https://martinfowler.com/bliki/PrinciplesOfXP.html
    title: Martin Fowler — Principles of XP
  - id: agile-simple-design
    resource: https://agilealliance.org/glossary/simple-design/
    title: Agile Alliance — Simple Design
  - id: metz-wrong-abstraction
    resource: https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction
    title: Sandi Metz — The Wrong Abstraction
  - id: aws-review-process
    resource: https://docs.aws.amazon.com/wellarchitected/2024-06-27/framework/the-review-process.html
    title: AWS Well-Architected Framework — The review process
generated: { by: "codex/gpt-5.6", at: 2026-08-15T17:25:44Z }
---

# YAGNI: defer speculative capability and structure

**Defer capability and structure until the feature, constraint, or decision
that requires them is present. Preserve the option to design with better
information, and incur cost no earlier than necessary.**

## Good sought or protected

YAGNI protects two related goods:

- **Optionality** — delaying commitment preserves the ability to choose the
  structure that fits the need that actually arrives.
- **Economic timing** — delaying cost while delivering valuable behavior
  sooner improves the timing of expenditure and return.

The principle is not chiefly about saving typing effort or predicting that a
future requirement will disappear. Beck's later account emphasizes that even a
correct forecast can be implemented too early: premature structure spends an
option before the information and need that give the choice its value.[^beck]

## Warrant and provenance

YAGNI—“you aren't gonna need it”—originated in an exchange between Kent Beck
and Chet Hendrickson on the Chrysler C3 project. Fowler describes it as a
mantra associated with XP's Simple Design practice and incremental design;
Beck describes it more precisely as a question of timing.[^fowler][^beck]

Its underlying reasoning is broader than the slogan:

- requirements and constraints become more informative as work proceeds;
- unused structure carries comprehension, maintenance, integration, and
  modification costs;
- an early abstraction can encode the wrong variation and become costlier than
  visible duplication; and
- paying for structure before it enables value worsens the timing of the
  investment.[^metz]

## Normative strength and scope

YAGNI is a **defeasible software-engineering principle and decision default**,
not a prohibition against design. It applies when deciding whether to add
future-facing capability, abstraction, indirection, configuration, extension
points, dependencies, infrastructure, tooling, process, or other supporting
structure.

“Needed” is temporal rather than merely evidential. A future obligation can be
certain without needing implementation today. Conversely, lead time, an
irreversible deadline, or a decision that will soon foreclose safe options can
make preparatory work a present need.

## Practical implications

Before committing to additional capability or structure, ask:

1. Which current feature, constraint, invariant, or concrete risk requires it?
2. Why must the commitment be made now rather than when more information is
   available?
3. What option does committing now remove?
4. What carrying cost will intervening work bear?
5. What is the cheapest reversible action that safely preserves the decision?

If no present need justifies commitment, defer it. Record an important
constraint, run a focused experiment, or preserve a narrow reversible seam
when that is sufficient; do not implement the imagined future in full.

## Present quality is not speculative capability

YAGNI does not excuse brittle, opaque, unsafe, or unverified work. Existing
requirements for correctness, security, data integrity, accessibility,
compatibility, reliability, and operability are present constraints. Tests,
clear responsibilities, continuous integration, and local improvements can be
justified by the current need to understand and change software safely without
implementing a future feature.

## Tensions and limits

Waiting is not always the responsible choice. Give earlier attention to a
decision when delay would:

- make a safety, security, legal, or data-integrity obligation impossible to
  meet;
- cross an expensive-to-reverse public API, data, protocol, or infrastructure
  boundary;
- ignore real procurement, migration, certification, or construction lead
  time; or
- close an option whose preservation costs less than losing it.

Reversibility changes the burden of judgment. Reversible “two-way door”
decisions ordinarily support waiting; difficult-to-reverse decisions warrant
earlier investigation and proportionate preparation.[^aws]

## Judgment cases

### A likely feature later

A team expects a second pricing model next quarter but is delivering the first
one now. Building a generic pricing framework today commits to guessed
variation and delays the current model. Defer the framework; learn from the
first implementation and introduce shared structure when the second model is
active work.

### A costly boundary now

A public event schema will be consumed by parties that cannot be migrated
atomically. Compatibility is already a current requirement even if some
consumers arrive later. Design and test the compatibility boundary now, while
deferring unrelated extension points.

### Structure needed by today's change

A requested behavior change is unnecessarily risky because two responsibilities
are tangled. The structural need is no longer speculative. Apply the related
[Tidy First](tidy-first.md) pattern to make only the preparatory change that
enables today's behavior change.

## Common misreadings

- **“Do the least work possible.”** YAGNI governs premature commitment, not
  diligence or completeness for present requirements.
- **“We probably will not need it.”** Probability is not the core claim. Even
  a likely future capability can be built too early.
- **“Never design ahead.”** Investigation and preserving a cheap option differ
  from implementing the full future capability.
- **“Quality can wait.”** Current quality obligations and safe changeability
  are not speculative features.
- **“Simple means shortest.”** Simplicity concerns justified structure and
  understandability, not merely line count.

## Relationships

- **Simple and incremental design** are practices within which YAGNI is
  exercised and corrected through feedback.[^simple]
- **Wrong abstraction** is a common consequence of violating the principle by
  deciding too early which cases belong together.[^metz]
- **Tidy First** is a related pattern for introducing structure at the moment a
  current behavior change makes it useful, rather than in anticipation of an
  imagined change.

[^beck]: Beck calls YAGNI a meditation on timing and grounds the cost of
    speculative structure in lost optionality and unfavorable economic timing.
[^fowler]: Fowler traces the phrase to Beck and Hendrickson and relates it to
    XP's Simple Design and incremental-design practice.
[^metz]: Metz shows how premature shared abstractions accumulate parameters and
    conditionals when later cases vary differently than expected.
[^aws]: AWS uses reversible and irreversible decisions to distinguish the
    amount and timing of analysis a choice warrants.
[^simple]: The Agile Alliance describes simple design as continuous design in
    which elements justify their cost and decisions can be deferred to gather
    information.
