---
type: Guide
title: Keeping specifications authoritative
description: Use once an executable specification is accepted and must stay trustworthy; separate acceptance from verification, record evidence for obligations that cannot run on every change, triage a failure before editing either side, retire dead rules, and gate generated change on reviewed intent.
tags: [testing, executable-specifications, living-documentation, characterization-testing, spec-driven-development, ci, pe-engineering]
status: stable
sources:
  - id: adzic-spec-by-example
    resource: https://www.manning.com/books/specification-by-example
    title: Specification by Example — How Successful Teams Deliver the Right Software
  - id: martraire-living-docs
    resource: https://hilton.org.uk/blog/living-documentation-principles
    title: Principles of Living Documentation
  - id: cucumber-antipatterns
    resource: https://cucumber.io/blog/bdd/cucumber-anti-patterns-part-two/
    title: Cucumber Anti-Patterns
  - id: characterization-tests
    resource: https://understandlegacycode.com/blog/characterization-tests-or-approval-tests/
    title: Regression, Characterization, and Approval Tests
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Keeping specifications authoritative

Use this guide once a specification has been admitted and written with
[Designing executable
specifications](designing-executable-specifications.md) and the question is
how it stays trustworthy: what its authority rests on, what counts as evidence,
what to do when it fails, and when to let it go.

## Separate acceptance from verification

Authority comes from acceptance: someone with standing over the rule has read
the text and agreed it states the obligation. That is the same act that makes a
requirement normative rather than candidate, and where a separate requirement
record exists it holds the authority while the specification witnesses it.
Verification maintains evidence that the system honors it, which
[Verification and
validation](../solution/requirements/foundations/verification-and-validation.md)
separates from validation: evidence that the system honors a rule is not
evidence the rule was the right one. The two fail separately. When automation breaks, is
flaky, or does not yet exist, the obligation stays authoritative and what is
missing is evidence; record the gap rather than demoting the rule. Continuous
execution is how evidence stays current: run the set on every change and
publish its readable output where the rules' owners can reach it, because
documentation earns trust by being automatically checked, not carefully
maintained.[^adzic-spec-by-example][^martraire-living-docs]

## Evidence obligations that cannot run on every change

Some accepted obligations do not fit a per-change pipeline — a manual
accessibility review, a static check such as a schema or license audit, a rule
that holds only in a deployed environment. They remain specifications: the
admission and text rules of the designing guide apply unchanged, and only the
evidence regime differs. Keep them in the same set, state for each how and
when it is evidenced and by whom, and treat a missing run as an evidence gap
rather than as the rule's absence. Where part of such an obligation can be
automated, bind that part as usual and leave the remainder explicitly manual.

## Triage a failure before editing either side

When a specification fails, decide which side is wrong before changing
anything: the implementation stopped honoring the rule, the rule changed and
the text should change deliberately with its owner, or the text never stated
the rule correctly. Never edit a specification to match observed behavior to
make a suite green — that converts it into a characterization test still
labeled as intent.[^characterization-tests] Retire specifications whose rule is
gone, rewrite ones kept only because they were once written, and declare who
owns each set's text.[^cucumber-antipatterns]

## Gate generated change on reviewed intent

When code is cheap to regenerate, the executable specification holds intent
stable across regenerations and is the gate a generated change must pass: its
text is readable by a reviewer who did not write the change, and its failure
is attributable to a named rule. The admission rules do not relax under
generation; the characteristic failure is volume — many generated examples,
none disputed by anyone, encoding the current implementation rather than a
decision. Treat a specification proposed alongside an implementation as
unreviewed until someone with standing has read it, and keep authored intent
separate from generated coverage.

## Completion check

- [ ] Each specification's authority rests on recorded acceptance by someone
      with standing, not on whether its automation currently passes.
- [ ] Automated specifications run on every change and publish readable
      output where the rules' owners can reach it.
- [ ] Every obligation that cannot run per change states how, when, and by
      whom it is evidenced, and a missing run is recorded as a gap.
- [ ] A failure is attributed to implementation, rule, or text before either
      is edited, and no text is changed to match observed behavior.
- [ ] Specifications whose rule is gone are retired, and each set names its
      text owner.
- [ ] Specifications proposed with generated changes are treated as
      unreviewed until someone with standing has read them.

## Northbank: a new provider does not inherit old evidence

Northbank's [commitment specimen](../solution/requirements/authoring/northbank-commitment-requirements.md)
limits the accepted replacement to a controlled local allocation scope. Adding
partner capacity reopens hold expiry and unknown-outcome behavior. Preserve the
old rule and its results while the new proposal is considered; do not edit a
failing witness merely to admit the new code. A local-store result does not
become provider-integration evidence because the scenario text looks similar.

[^adzic-spec-by-example]: Adzic, [Specification by Example](https://www.manning.com/books/specification-by-example), presents validating frequently and evolving a living documentation system as process patterns distinct from deriving the specification itself.
[^martraire-living-docs]: [Principles of Living Documentation](https://hilton.org.uk/blog/living-documentation-principles) summarizes Martraire's collaborative, insightful, reliable, and low-effort documentation, made reliable by automated checks.
[^cucumber-antipatterns]: Cucumber, [Cucumber Anti-Patterns](https://cucumber.io/blog/bdd/cucumber-anti-patterns-part-two/), catalogs retained noisy scenarios and scenarios kept without an owner.
[^characterization-tests]: [Regression, Characterization, and Approval Tests](https://understandlegacycode.com/blog/characterization-tests-or-approval-tests/) distinguishes tests that capture actual behavior from tests that assert intended behavior.
