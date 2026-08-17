---
type: Pattern
title: Tidy First
description: A contextual pattern for making the smallest useful behavior-preserving structural change immediately before a behavior change it makes easier.
tags: [tidy-first, preparatory-refactoring, refactoring, structural-change, behavioral-change, small-safe-steps, optionality]
status: draft
sources:
  - id: beck-tidy-first-preface
    resource: https://www.oreilly.com/library/view/tidy-first/9781098151232/preface01.html
    title: Kent Beck — Tidy First?, Preface
  - id: beck-tidy-timing
    resource: https://www.oreilly.com/library/view/tidy-first/9781098151232/ch21.html
    title: Kent Beck — First, After, Later, Never
  - id: beck-tidy-economics
    resource: https://www.oreilly.com/library/view/tidy-first/9781098151232/ch27.html
    title: Kent Beck — Options Versus Cash Flows
  - id: beck-tidy-conclusion
    resource: https://www.oreilly.com/library/view/tidy-first/9781098151232/ch33.html
    title: Kent Beck — Tidy First?, Conclusion
  - id: fowler-preparatory-refactoring
    resource: https://martinfowler.com/articles/preparatory-refactoring-example.html
    title: Martin Fowler — An example of preparatory refactoring
  - id: se-radio-tidy-first
    resource: https://se-radio.net/?p=8851
    title: Software Engineering Radio 615 — Kent Beck on Tidy First?
generated: { by: "codex/gpt-5.6", at: 2026-08-15T17:25:44Z }
---

# Tidy First

**Before a needed behavior change, make the smallest safe,
behavior-preserving structural change that materially makes the behavior change
easier; then make the behavior change separately.**

## Context

You are about to change observable software behavior. The current structure
makes that change harder to understand, implement, verify, review, or reverse
than it needs to be.

## Problem

Changing behavior through an inconvenient structure increases cognitive load
and entangles two questions: whether the structure changed safely and whether
the new behavior is correct. Broad cleanup, however, delays value and can
expand without a natural stopping point. Should you change the structure
before changing the behavior?

## Forces

- **Immediate delivery** favors making the behavior change directly.
- **Change cost and risk** may fall after a small structural adjustment.
- **Reviewability** improves when structural and behavioral intent remain
  distinguishable.
- **Optionality** can increase when a reversible structural change makes more
  behavior changes affordable.
- **Uncertainty** makes large preparatory redesign risky.
- **Tidying appetite** can turn one useful adjustment into unrelated cleanup.

## Solution

Identify the specific behavior change first. Ask whether one small structural
change would make that change materially easier or safer.

When the answer is yes:

1. Make only the behavior-preserving structural change that enables the next
   behavior change.
2. Verify that observable behavior remains unchanged.
3. Keep the structural change distinguishable in the history and review—often
   as a separate commit or pull request.
4. Stop tidying when the behavior change is sufficiently easy.
5. Make and verify the behavior change separately.

Prefer tiny, reversible steps. If a proposed tidying cannot be made safely,
reduce its size or change the sequence.

The pattern is a question, not a universal command. Compare the cost and risk
of tidying plus the easier behavior change with making the behavior change
directly. Include near-term option value when several active changes would
benefit, but do not use hypothetical future work to justify an open-ended
redesign.[^economics]

## Consequences

Applied well, the pattern:

- lowers the cognitive and mechanical difficulty of the behavior change;
- separates evidence about preserved behavior from evidence about new
  behavior;
- produces a more intelligible sequence for reviewers and future maintainers;
  and
- exercises new structure immediately, reducing speculative design.

It also has liabilities:

- delivery is delayed by the preparatory step;
- apparently structural changes can accidentally alter behavior;
- a chain of attractive tidyings can outrun the change that justified it; and
- separate commits or reviews may add coordination overhead.

## When to use

Consider tidying first when:

- a current behavior change is clear and localized;
- a small structural change has an immediate, explainable payoff;
- behavior can be checked before and after the structural step; and
- separation will make implementation or review materially safer or clearer.

Typical examples include moving related declarations together, naming an
understood expression, extracting a focused helper, introducing a narrow
interface over an existing implementation, or reordering code to match reading
and change order.

## When not to use

Change behavior directly, tidy afterward or later, or do not tidy when:

- the structural work does not help the current behavior change;
- the direct behavior change is already smaller and safer;
- behavior cannot be preserved or verified through the proposed step;
- urgent restoration or containment makes preparatory work too costly; or
- the proposed work is a broad redesign justified mainly by possible future
  requirements.

Read-only research, diagnosis, and review do not authorize a tidying change.
The pattern governs sequencing after a change is already authorized.

## Evidence and lineage

Beck presents “tidy first?” as a recurring software-design decision and
catalogues small tidyings that preserve behavior while changing structure. He
explicitly treats first, after, later, and never as legitimate outcomes and
grounds the choice in cost, revenue, coupling, cohesion, and option value.[^beck]

Fowler's earlier **Preparatory Refactoring** describes the same solution core:
refactor into a structure that makes the desired feature easy, then add the
feature. The independent formulation and long-standing use of preparatory
refactoring support treating Tidy First as a named software-change pattern
rather than only a slogan.[^fowler]

## Relationships

- [YAGNI](yagni-and-speculative-complexity.md) supplies the complementary
  principle: defer speculative structure until a real need arrives. Tidy First
  describes one way to introduce that structure just in time.
- **Preparatory Refactoring** is an earlier name for substantially the same
  solution, while Tidy First gives greater attention to batch size, separation,
  economics, and when not to tidy.
- **Incremental design and refactoring** are broader practices in which the
  pattern is learned, performed, and judged.

[^economics]: Beck recommends tidying first when the combined cost of tidying
    and the resulting easier behavior change is lower than changing directly,
    while also accounting for option value and the timing of costs and returns.
[^beck]: Beck's book and interview present repeated examples, timing
    alternatives, management guidance, and the forces governing the decision.
[^fowler]: Fowler documents Preparatory Refactoring as restructuring code into
    a form that makes the intended feature easier to add.
