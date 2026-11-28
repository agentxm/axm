---
type: Pattern
title: Executable specifications
description: When intended behavior must be shared with its owners and checked continuously, express accepted rules in readable specifications bound to executable checks while keeping authority separate from verification.
tags:
- testing
- executable-specifications
- specification-by-example
- bdd
- acceptance-testing
- gherkin
- living-documentation
- test-architecture
- characterization-testing
- spec-driven-development
- ci
- pattern
- software-testing
status: draft
sources:
- id: north-introducing-bdd
  resource: https://dannorth.net/introducing-bdd/
  title: Introducing BDD
- id: fowler-spec-by-example
  resource: https://martinfowler.com/bliki/SpecificationByExample.html
  title: Specification by Example
- id: fowler-business-readable
  resource: https://martinfowler.com/bliki/BusinessReadableDSL.html
  title: Business Readable DSL
- id: fowler-given-when-then
  resource: https://martinfowler.com/bliki/GivenWhenThen.html
  title: Given When Then
- id: adzic-spec-by-example
  resource: https://www.manning.com/books/specification-by-example
  title: Specification by Example — How Successful Teams Deliver the Right Software
- id: adzic-team-interviews
  resource: https://manning-content.s3.amazonaws.com/download/0/e31349c-e7f9-457d-834d-3a29e71e9136/adzic_ch01.pdf
  title: Gojko Adzic — Specification by Example, chapter 1
- id: cucumber-better-gherkin
  resource: https://cucumber.io/docs/bdd/better-gherkin/
  title: Cucumber — Writing Better Gherkin
- id: cucumber-brief
  resource: https://cucumber.io/blog/bdd/keep-your-scenarios-brief/
  title: Keep Your Scenarios BRIEF
- id: cucumber-antipatterns
  resource: https://cucumber.io/blog/bdd/cucumber-anti-patterns-part-two/
  title: Cucumber Anti-Patterns
- id: keogh-criteria-scenarios
  resource: https://lizkeogh.com/2011/06/20/acceptance-criteria-vs-scenarios/
  title: Acceptance Criteria vs. Scenarios
- id: farley-four-layer
  resource: https://www.adamsanderson.co.uk/blog/2025-02-22-acceptance-tests-and-playwright/
  title: Building Acceptance Tests Using a Four-Layer Model
- id: bdd-quality-study
  resource: https://pmc.ncbi.nlm.nih.gov/articles/PMC7251619/
  title: Characterising the Quality of Behaviour Driven Development Specifications
- id: pact-intro
  resource: https://docs.pact.io/
  title: Pact — Contract Testing
- id: characterization-tests
  resource: https://understandlegacycode.com/blog/characterization-tests-or-approval-tests/
  title: Regression, Characterization, and Approval Tests
- id: martraire-living-docs
  resource: https://hilton.org.uk/blog/living-documentation-principles
  title: Principles of Living Documentation
- id: prior-design-guide
  resource: https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/software-engineering-foundations/src/behavior/designing-executable-specifications.md
  title: Designing executable specifications
- id: prior-maintenance-guide
  resource: https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/software-engineering-foundations/src/behavior/keeping-specifications-authoritative.md
  title: Keeping specifications authoritative
generated: { by: codex/gpt-6, at: 2026-11-22T02:14:03Z }
---

# Executable specifications

When intended behavior must be shared with its owners and checked continuously,
express accepted rules in readable specifications bound to executable checks,
while keeping authority separate from verification.

## Context and problem

People responsible for a system's behavior need to agree on what it should do
and recognize when it stops doing so. Prose can drift away from implementation;
tests can preserve observed behavior without establishing that anyone intended
it. A passing suite alone cannot settle which rule is right.

The recurring response is a specification that people who do not read the
implementation can read and dispute, and whose automation checks whether the
system honors the accepted rule.[^north-introducing-bdd][^fowler-spec-by-example]
Its defining concerns are authority and audience. Test level, notation, and
framework remain separate choices: a specification may run as a unit test, and
a browser journey may check behavior without owning any statement of intent.

## Forces

- **Readable intent and executable detail.** Readers need the domain rule;
  automation needs concrete operations, setup, and observations. Mixing these
  makes the text depend on implementation mechanics.
- **Accepted intent and observed behavior.** Existing behavior supplies useful
  evidence, but deriving expectations from it does not establish an obligation.
- **Decisive examples and broad coverage.** Examples clarify ambiguities that
  matter to readers; exhaustive matrices can obscure the rule they exercise.
- **Stable rules and changing implementations.** A rule may survive changes to
  interfaces, storage, or deployment. Its automation still needs maintenance.
- **Current evidence and verification cost.** Frequent execution reveals drift,
  but broad test worlds, brittle bindings, and obligations requiring other
  forms of review limit what a fast automated run can establish.

## Design response

Give accepted rules a readable representation, bind checks beneath that
representation, and maintain both the rule's authority and its evidence.
Let the check report whether the implementation satisfies the stated rule.
Keep the rule readable when adapting its automation.[^adzic-spec-by-example]

### Establish the authority

Acceptance comes from someone with standing over the rule. The specification
may hold the requirement itself or witness a separate requirement record:

| Situation | Authority relationship |
| --- | --- |
| A requirement record already states the rule | The specification witnesses that requirement; changes to the two follow the requirement's authority |
| The project accepts the specification text as the requirement | Its text holds the obligation; implementation and supporting coverage conform to it |

Choosing and accepting a requirement's form belongs to requirements engineering.
[Selecting a requirement specification method](../../requirements-engineering/authoring/selecting-a-specification-method.md)
compares prose, examples, models, and formal notation. This pattern addresses
how the executable form connects accepted meaning to continuing evidence.

### Separate the rule, examples, and coverage

| Part | Responsibility |
| --- | --- |
| Rule | State an obligation a stakeholder can accept or reject |
| Examples | Use concrete cases to settle material ambiguities; distinguish adjudicating examples from illustrations |
| Supporting coverage | Check additional boundaries, generated inputs, and combinations without redefining the rule |

Examples are deliberately incomplete.[^fowler-spec-by-example] Acceptance
criteria express abstract rules; scenarios supply concrete cases. When the
examples follow immediately from a criterion, extra scenarios may add little
understanding.[^keogh-criteria-scenarios] A decision table or property can be the
authoritative text when its audience reads and accepts that form directly.

Use the rule's domain language, named actors, and concrete data. Keep each
example focused on one rule and its essential context, triggering event, and
observable outcome.[^cucumber-brief][^fowler-given-when-then] First-person
actors can hide which party acts; examples without real values can merely
repeat the rule.[^cucumber-antipatterns]

Ask whether the text must change when the implementation changes. If so,
incidental mechanics may have entered the readable layer—unless the rule
itself concerns that mechanism.[^cucumber-better-gherkin] A status code is
incidental to a refund entitlement but essential to an API compatibility rule;
a stored record may be incidental to pricing but essential to retention.
Domain meaning decides what belongs in the text.

### Bind automation beneath the readable layer

Separate responsibilities enough that replacing automation does not require
rewriting the rule:[^farley-four-layer]

| Responsibility | Contains | Changes when |
| --- | --- | --- |
| Specification | Rules and examples in their audience's language | The rule changes |
| Domain actions | Operations and observations expressed in domain terms | The domain vocabulary changes |
| Protocol drivers | How actions run through an interface, such as HTTP, in-process calls, or a browser | The interface changes |
| System | The subject under test | Its implementation changes |

These are responsibilities, not four mandatory abstractions. A pure function's
specification can call it directly. A rule shared by a browser, API, and batch
import can use several drivers beneath the same readable statement. Choose the
smallest separation that preserves readable intent and replaceable automation.

Bind at the lowest layer that still exercises the rule. Driving every
specification through a browser adds slowness and brittleness.[^cucumber-antipatterns]
Use [Evidence-matched test world](evidence-matched-test-world.md) to choose
the boundaries needed to detect a violation. If the outcome depends on
rendering or interaction, [Browser test evidence](../writing-browser-test-evidence.md)
identifies which observations need a browser.

Organize domain actions by domain concept, reuse established phrasing, and
keep vocabulary and abstraction consistent across the suite.[^bdd-quality-study]
Setup, credentials, selectors, navigation, and storage observations belong
below the text whenever the obligation does not depend on them.

### Choose a notation for the audience

Gherkin is one option. Domain-named tests, tables, properties, and contract
examples can also express readable obligations. The value is that the audience
can read the specification; requiring that audience to write the automation
adds a different cost.[^fowler-business-readable]

Property-based checks usually provide supporting coverage, but an accepted
invariant can itself be the readable specification. Consumer-driven contracts
can express integration obligations through request and response examples;
asserting only what the consumer uses avoids unnecessary coupling.[^pact-intro]
A contract suite's interface coverage and its authority over intended behavior
remain separate properties. Formal specifications can address state spaces
examples cannot cover; they do not remove the need for a form its owners can
understand and accept.

## Applicability and limits

The readable layer, bindings, and continuing ownership earn their cost when:

- The behavior expresses a decided rule, with a meaningful alternative.
- Someone beyond the implementation's author has standing to dispute it.
- The rule can outlive the implementation that currently enforces it.
- An existing specification does not already own the same rule.

The time of authorship does not decide authority. A specification written after
implementation can still express independently accepted intent. Expectations
inferred solely from observed behavior form a characterization or approval
test; they preserve evidence of what happens without establishing what ought
to happen.[^characterization-tests]

Ordinary tests can check implementation details without this readable layer.
A rule awaiting acceptance remains a proposal even if its checks pass. A wholly
manual assessment can verify an accepted obligation, but does not by itself
make that obligation an executable specification.

## Consequences and excessive use

Appropriate use still costs review time, ownership, automation maintenance,
and execution capacity. Applying the pattern to every test adds ceremony to
mechanisms that do not need independent agreement. Too many example-table rows
can bury the few cases that settle ambiguity; UI-driven scenarios can couple
stable rules to incidental interactions.[^cucumber-antipatterns] Generated
examples can multiply coverage while leaving intended behavior unexamined.

Reduce those costs by retaining the smallest useful readable set, keeping
exhaustive coverage beneath it, and retiring statements whose obligations have
ended. Useful specifications survive because their rules remain live, not
because someone once wrote their scenarios.

### Acceptance and evidence remain separate

A broken binding, flaky run, or missing execution leaves an evidence gap; it
does not revoke an accepted obligation. Run automated checks on every change
where feasible and make their readable results available to the rule's
owners.[^adzic-spec-by-example][^martraire-living-docs]

Some obligations need additional evidence, such as manual accessibility review
or checks in a deployed environment. State how, when, and by whom that evidence
is obtained. Bind the automatable part and identify the remainder explicitly;
an automated result cannot stand for an unperformed manual assessment. A
missing run is an evidence gap, not the disappearance of the rule.

### Attribute a failure before changing intent

Check whether automation failed, implementation stopped honoring the rule,
the accepted rule changed, or the text never expressed it correctly. Change
the appropriate part and involve the rule's owner when intent changes. Editing
the text merely to match current behavior turns it into characterization
while leaving it labeled as intended behavior.[^characterization-tests]

Give each set an accountable text owner. Retire rules whose obligations have
ended, and reconsider scenarios retained only because they were once
written.[^cucumber-antipatterns]

### Review intent independently of generated coverage

When code is regenerated, the accepted specification can hold intent stable
and make a failure attributable to a named rule. A specification proposed
alongside generated implementation remains unreviewed until someone with
standing accepts it. Keep that authored intent distinct from generated cases
that exercise it; volume and successful execution do not establish acceptance.

## Worked example

Suppose a membership team approves a policy with a full refund through day
fourteen and zero thereafter. It counts calendar dates in the membership's
billing time zone. The following fictional examples distinguish the two
outcomes in terms a member-services reviewer can check.

```gherkin
Rule: An annual membership cancelled up to 14 calendar days after purchase receives a full refund.
      Later cancellations receive no refund. Count dates in the membership's billing time zone.

  Example: Priya cancels on the last day of the window
    Given Priya bought an annual membership for £120 on 1 March
    When she cancels it on 15 March
    Then she is refunded £120

  Example: Priya cancels the day after the window closes
    Given Priya bought an annual membership for £120 on 1 March
    When she cancels it on 16 March
    Then she is refunded £0
```

If those same amounts came only from replaying two cancellations against the
old system, preserve the observations in a characterization test. A passing
run cannot tell the reviewer what members are entitled to receive. Once
the policy is accepted, additional dates can exercise the boundary without
adding another policy statement.

For this entitlement, interface walkthrough details have other homes:

| Incidental detail | Home |
| --- | --- |
| Sign-in, credentials, and unrelated identifiers | Binding setup |
| Page paths, buttons, and selectors | Protocol driver |
| A refund database row | Narrow integration test |
| HTTP response status | Contract test |

Those details would stay in readable text if they were the obligation being
specified—for example, a status code promised to API consumers.

## Evidence and relationships

This draft consolidates the repository's earlier design and maintenance
guides.[^prior-design-guide][^prior-maintenance-guide] In interviews reported
by Adzic, members of Iowa Student Loan described using living specifications
to decide which lending rules had to change. At Songkick, tests recorded how
activity feeds should behave while the team replaced their infrastructure.
The teams reported their experiences alongside other changes in development
practice, which limits attribution of the outcomes to any one technique.[^adzic-team-interviews]
Sanderson's blog tests show a concrete way to bind domain actions such as
opening a post to a browser driver. The BDD quality study informs vocabulary
and abstraction choices.[^farley-four-layer][^bdd-quality-study]
These sources support distinct parts of the design. The refund example is
fictional. Whether a team's rule owners can actually read its chosen
specification and use a failed check to resolve a disagreement calls for
observation in that team.

[^north-introducing-bdd]: [Introducing BDD](https://dannorth.net/introducing-bdd/).
[^fowler-spec-by-example]: [Specification by Example](https://martinfowler.com/bliki/SpecificationByExample.html).
[^fowler-business-readable]: [Business Readable DSL](https://martinfowler.com/bliki/BusinessReadableDSL.html).
[^fowler-given-when-then]: [Given When Then](https://martinfowler.com/bliki/GivenWhenThen.html).
[^adzic-spec-by-example]: [Specification by Example — How Successful Teams Deliver the Right Software](https://www.manning.com/books/specification-by-example).
[^adzic-team-interviews]: Gojko Adzic, [Specification by Example, chapter 1](https://manning-content.s3.amazonaws.com/download/0/e31349c-e7f9-457d-834d-3a29e71e9136/adzic_ch01.pdf), pp. 5–7.
[^cucumber-better-gherkin]: [Cucumber — Writing Better Gherkin](https://cucumber.io/docs/bdd/better-gherkin/).
[^cucumber-brief]: [Keep Your Scenarios BRIEF](https://cucumber.io/blog/bdd/keep-your-scenarios-brief/).
[^cucumber-antipatterns]: [Cucumber Anti-Patterns](https://cucumber.io/blog/bdd/cucumber-anti-patterns-part-two/).
[^keogh-criteria-scenarios]: [Acceptance Criteria vs. Scenarios](https://lizkeogh.com/2011/06/20/acceptance-criteria-vs-scenarios/).
[^farley-four-layer]: [Building Acceptance Tests Using a Four-Layer Model](https://www.adamsanderson.co.uk/blog/2025-02-22-acceptance-tests-and-playwright/).
[^bdd-quality-study]: [Characterising the Quality of Behaviour Driven Development Specifications](https://pmc.ncbi.nlm.nih.gov/articles/PMC7251619/).
[^pact-intro]: [Pact — Contract Testing](https://docs.pact.io/).
[^characterization-tests]: [Regression, Characterization, and Approval Tests](https://understandlegacycode.com/blog/characterization-tests-or-approval-tests/).
[^martraire-living-docs]: [Principles of Living Documentation](https://hilton.org.uk/blog/living-documentation-principles).
[^prior-design-guide]: [Designing executable specifications](https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/software-engineering-foundations/src/behavior/designing-executable-specifications.md).
[^prior-maintenance-guide]: [Keeping specifications authoritative](https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/software-engineering-foundations/src/behavior/keeping-specifications-authoritative.md).
