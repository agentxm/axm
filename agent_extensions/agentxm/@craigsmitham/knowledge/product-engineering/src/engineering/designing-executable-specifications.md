---
type: Guide
title: Designing executable specifications
description: Use when intended behavior needs an authoritative, human-readable, continuously verified statement that non-authors can dispute; choose which rules earn a specification, keep incidental mechanics out of the specification text, and bind automation below the readable layer.
tags: [testing, executable-specifications, specification-by-example, bdd, acceptance-testing, gherkin, living-documentation, test-architecture, characterization-testing, spec-driven-development, pe-engineering]
status: stable
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
generated: { by: claude/fable-5.1, at: 2026-09-08T14:31:02Z }
---

# Designing executable specifications

Use this guide when a behavior needs a statement of intent that people who do
not read the code can read and dispute, and that fails automatically when the
system stops honoring it.

An executable specification is defined by **authority and audience**, not by
test level, notation, or framework. Its text is what intended behavior means;
code and automation conform to it. That axis is orthogonal to the level ladder:
a specification may execute as a unit test, and a browser end-to-end test may
be no specification at all. Choose the level with the [narrowest effective
test](choosing-the-narrowest-effective-test.md),
[cross-boundary](designing-cross-boundary-and-end-to-end-tests.md), and
[browser-dependent](choosing-browser-dependent-interface-tests.md) guides; use
this guide to decide which behaviors earn a specification and what its text may
contain.[^north-introducing-bdd][^fowler-spec-by-example] A specification is
not a contract suite: a contract suite comprehensively tests a consumer-facing
interface, a specification states a rule someone could have decided
differently, and one suite earns the two properties separately.

## Where the obligation comes from

A specification is the form an obligation takes when non-authors must read it
and automation must keep checking it. The obligation itself, its wording,
classification, authority, and lineage through change, belongs to
[Requirements](../solution/requirements/) in What to build, and choosing which
form makes an obligation precise enough for its consequence is [Selecting a
requirement specification
method](../solution/requirements/authoring/selecting-a-specification-method.md).
This guide takes over at one of those forms: which accepted rules earn an
executable, continuously verified statement, what its text may contain, and how
automation binds beneath it.

That leaves one question the seam has to answer plainly, because both sides
speak of authority.

| Situation | Where the authority sits |
| --- | --- |
| A separate requirement record already states the rule | The requirement. The specification is a witness bound to it under [One authority, many witnesses](../solution/requirements/foundations/one-authority-many-witnesses.md), and the two change together with the requirement's record deciding the wording |
| No separate record states the rule | The specification text. It is the requirement, and everything below about acceptance, standing, and retirement applies to it directly |

What is never correct is two accepted statements of the same rule with no
declared authority between them. A specification written to shadow an existing
requirement is a duplicate authority, not a second opinion.

## Desired outcomes

- **Disputable rules** — each specification states a rule a stakeholder could
  reasonably disagree with, not a mechanism.
- **Text as authority** — implementation and automation change to match the
  specification, never the reverse.
- **Readable and essential** — the language of the rule's own domain, named
  actors, concrete data, and nothing the obligation does not depend on.
- **Automation below the text** — interface and implementation change without
  edits to a specification.
- **Accepted, then evidenced** — authority comes from acceptance by someone
  with standing; continuous execution keeps the evidence current.

## Rule, examples, and coverage

A specification has three parts with different jobs:

| Part | Job | Authority |
| --- | --- | --- |
| **Rule** | States the obligation in a sentence a stakeholder can accept or reject | Authoritative; code and examples conform to it |
| **Examples** | Show the rule with concrete data and settle its material ambiguities | Authoritative where they adjudicate; otherwise illustrative |
| **Supporting coverage** | Exercises the rule across its input space: boundary sweeps, generated cases, matrices | Checks the rule; never defines it |

Acceptance criteria are abstract rules; examples are concrete cases drawn from
them. Do not write an example for every criterion — when the examples follow
from it in seconds of conversation, leave it as a
criterion.[^keogh-criteria-scenarios] Examples are deliberately incomplete;
supporting coverage checks additional cases and properties without redefining
the rule.[^fowler-spec-by-example] Where the audience reads properties or
decision tables directly — a pricing table finance owns — that form is the
authoritative text.

## Admit a specification deliberately

A specification carries a readable layer, a binding layer, and an obligation to
keep both honest — a cost most tests should not pay. Admit one only when all
four hold:

1. **It is a rule, not a mechanism** — the behavior was decided, and a
   different decision was available.
2. **Someone outside the author has standing** — a stakeholder, another team, a
   regulator, or a downstream consumer can contradict it.
3. **It outlives the implementation** — the rule survives a rewrite of whatever
   enforces it today.
4. **No existing specification owns it** — no other already states the rule.

When the text was written does not decide admission. A rule specified after
its implementation exists is still a specification if someone with standing
accepted it independently of what the code does. A rule whose expected
outcomes were inferred from observed behavior is a characterization or
approval test whenever it was written — often valuable, and carrying no
authority over intent.[^characterization-tests]

## Write the specification text

Each specification states one rule and shows it with real data:[^cucumber-brief]

- **Domain language** — words from the domain the rule belongs to; when the
  rule is about a protocol or a record, a status code or retention period is
  domain language there.
- **Real data** — names, amounts, dates; placeholders hide what real values
  expose.
- **Intention revealing** — what the actor is achieving, not how.
- **Essential** — anything the obligation does not depend on is incidental;
  remove it.
- **Focused** — one rule per example; a second rule is a second example.
- **Brief** — most examples fit in five lines or fewer.

Name the actor: first-person "I" hides which party acts and
observes.[^cucumber-antipatterns] Keep the phases distinct — context, one
triggering event, observable outcome; two unrelated events mean two
specifications.[^fowler-given-when-then] Apply one test before accepting
wording: **will this text need to change if the implementation changes?** If
yes, incidental mechanics have leaked in and belong in the binding layer —
unless the rule is about that mechanism, in which case changing it changes
the rule.[^cucumber-better-gherkin] The opposite failure is as common — an
example with no concrete values restates the rule instead of illustrating
it.[^cucumber-antipatterns]

## Keep incidental content out of the text

What is incidental depends on the rule, not on the kind of content: a response
status is incidental to a refund entitlement and the whole obligation in an API
compatibility promise; a stored row is incidental to a pricing rule and the
obligation itself in a retention rule. Ask of each detail whether the
obligation depends on it and whether its audience would miss it. Content that
fails both belongs below the readable layer:

| Content | Incidental to | Home when incidental |
| --- | --- | --- |
| Interface mechanics: field entry, clicks, navigation, selectors | Nearly every rule | Binding layer |
| Sign-in, credentials, dates and identifiers the rule does not turn on | Any rule not about them | Binding layer |
| Wire formats, status codes, payload shape | Rules about what an actor is owed | Contract suite or integration test |
| Stored rows, log output, call counts | Rules about outcomes rather than records | Narrow test through an explicit seam |
| Exhaustive sweeps, validation matrices, combinatorial tables | Any rule whose decisive cases are already shown | Supporting coverage |
| Expectations inferred from existing behavior | Every specification | Characterization test, named as such |
| Rules no one outside the author could dispute | — | Ordinary test, with no specification ceremony |

**Parameterized expansion** masquerades as thoroughness: it multiplies cases
cheaply and is the common cause of bloated suites. Use an example table only
where each row settles a distinct ambiguity a reader needs
adjudicated.[^cucumber-antipatterns]

## Worked example

A refund rule, first written as a recorded interface walkthrough:

```gherkin
Scenario: Refund
  Given I am on the login page
  And I sign in as "user1@test.com" with password "Passw0rd!"
  And I navigate to "/account/membership"
  When I click "Cancel membership"
  Then I should see "Your refund is being processed"
  And the refunds table contains a row with status "PENDING"
  And the response status is 200
```

The reader learns how to drive the sign-in form, and cannot learn what a member
is entitled to. The same behavior as a specification:

```gherkin
Rule: An annual membership is refunded in full if cancelled within 14 days of purchase

  Example: Priya cancels on the last day of the window
    Given Priya bought an annual membership for £120 on 1 March
    When she cancels it on 15 March
    Then she is refunded £120

  Example: Priya cancels the day after the window closes
    Given Priya bought an annual membership for £120 on 1 March
    When she cancels it on 16 March
    Then she is refunded £0
```

| Removed | Reason | New home |
| --- | --- | --- |
| Sign-in steps and credentials | The entitlement does not depend on them | Binding layer |
| Page paths, button labels, message text | Interface mechanics | Protocol driver |
| `refunds` table row assertion | Storage is not what Priya is owed | Narrow integration test |
| Response status `200` | Transport is not what Priya is owed | Contract suite |

The examples sit on the boundary rather than either side of it, because
whether "within 14 days" includes the fourteenth day is part of the
entitlement, and a reader must be able to settle it from the text. Additional
dates and time variations belong in supporting coverage once the rule has
settled whether the window uses elapsed time or calendar days, its governing
time zone where applicable, and endpoint inclusion. Had the rule been an API
promise to integrators, the response status would have been part of it and
stayed.

## Separate the specification from its automation

Automate validation without changing the specification; when automation is
awkward, change the automation.[^adzic-spec-by-example] Four responsibilities
keep that possible:[^farley-four-layer]

| Responsibility | Contains | Changes when |
| --- | --- | --- |
| **Specification** | The rule and its examples, in domain language | The rule changes |
| **Domain actions** | A small vocabulary of domain operations and observations | The domain vocabulary changes |
| **Protocol drivers** | How an operation is performed against one interface: HTTP, in-process, browser | An interface changes |
| **System** | The subject under test | — |

These are responsibilities, not mandatory abstractions. What is required is
that the text stays readable and the automation can be replaced without
editing it; use the smallest implementation that achieves both. A pure
function's specification may call it directly, with domain actions and driver
collapsed into a few lines of the test; a rule that must hold across a
browser, an API, and a batch import needs the full set so one specification
runs through several drivers. Bind at the lowest layer that still exercises
the rule; driving every specification through a browser makes the suite slow
and brittle.[^cucumber-antipatterns] Maintain the middle layers as
deliberately as the text: organize domain actions by domain concept rather
than by feature file, reuse existing phrasing instead of coining synonyms,
keep the vocabulary small and free of terms the rule's audience does not use,
and hold one level of abstraction across a suite.[^bdd-quality-study]

## Choose a notation, not a framework

Gherkin is one notation. Table-driven examples, a plain test DSL with
domain-named cases, and a shared contract suite can each be executable
specifications, and a Gherkin file can easily fail to be one. Choose by who
must read the text: the value is that it is business-*readable*, not
business-*writable*.[^fowler-business-readable] **Property-based tests**
assert an invariant over generated inputs — usually supporting coverage, and
the authoritative form when the audience reads invariants. **Consumer-driven
contracts** specify an integration as request and response pairs; assert only
fields actually consumed, since over-specifying couples the consumer to
provider internals.[^pact-intro] **Formal specifications** check state spaces
examples cannot reach, and do not replace a readable set.

## Keep the specification trustworthy

Authority comes from acceptance by someone with standing; verification only
maintains evidence, and the two fail separately. [Keeping specifications
authoritative](keeping-specifications-authoritative.md) covers evidence for
obligations that cannot run on every change, failure triage, retirement, and
generated change.

## Completion check

- [ ] It states one decided rule someone outside the author can dispute, and
      no other specification already states it.
- [ ] Someone with standing accepted the text independently of the code.
- [ ] The text uses the rule's domain language, a named actor, and real data.
- [ ] Every detail in the text is one the obligation depends on, so the text
      changes only when the rule does.
- [ ] Examples settle the rule's material ambiguities; exhaustive coverage
      lives below the readable layer.
- [ ] Automation can be replaced without editing the text, through the
      smallest set of layers that achieves that.
- [ ] Its evidence, failure triage, and retirement follow [Keeping
      specifications authoritative](keeping-specifications-authoritative.md).
- [ ] Any test whose expectations were inferred from existing behavior is
      labeled a characterization test.

[^north-introducing-bdd]: North, [Introducing BDD](https://dannorth.net/introducing-bdd/), recounts replacing "test" with "behaviour" to give analysts, testers, developers, and the business one vocabulary for intent.
[^fowler-spec-by-example]: Fowler, [Specification by Example](https://martinfowler.com/bliki/SpecificationByExample.html), describes concrete examples as both specification and test, and warns that examples are inherently incomplete and cannot stand alone.
[^fowler-business-readable]: Fowler, [Business Readable DSL](https://martinfowler.com/bliki/BusinessReadableDSL.html), argues the value lies in business people reading the text, and that making it business-writable raises cost sharply.
[^fowler-given-when-then]: Fowler, [Given When Then](https://martinfowler.com/bliki/GivenWhenThen.html), sets out context, event, and outcome, and notes that frameworks execute "given" clauses as setup rather than description.
[^adzic-spec-by-example]: Adzic, [Specification by Example](https://www.manning.com/books/specification-by-example), presents the process patterns of illustrating with examples, refining the specification, automating validation without changing specifications, validating frequently, and evolving a living documentation system.
[^cucumber-better-gherkin]: Cucumber, [Writing Better Gherkin](https://cucumber.io/docs/bdd/better-gherkin/), contrasts declarative and imperative styles and offers the test of whether wording must change when the implementation does.
[^cucumber-brief]: Cucumber, [Keep Your Scenarios BRIEF](https://cucumber.io/blog/bdd/keep-your-scenarios-brief/), gives business language, real data, intention revealing, essential, focused, and brief as the qualities of a readable example.
[^cucumber-antipatterns]: Cucumber, [Cucumber Anti-Patterns](https://cucumber.io/blog/bdd/cucumber-anti-patterns-part-two/), catalogs testing through the UI, first-person actors, retained noisy scenarios, example-table overuse, blurred phases, and vague scenarios that only restate the rule.
[^keogh-criteria-scenarios]: Keogh, [Acceptance Criteria vs. Scenarios](https://lizkeogh.com/2011/06/20/acceptance-criteria-vs-scenarios/), distinguishes abstract criteria from concrete examples and recommends leaving criteria unwritten as scenarios until automation requires them.
[^farley-four-layer]: [Building Acceptance Tests Using a Four-Layer Model](https://www.adamsanderson.co.uk/blog/2025-02-22-acceptance-tests-and-playwright/) demonstrates test cases calling a domain DSL, drivers implementing that DSL per interface, and the same specifications running against different interfaces.
[^bdd-quality-study]: [Characterising the Quality of Behaviour Driven Development Specifications](https://pmc.ncbi.nlm.nih.gov/articles/PMC7251619/), reports practitioner support for conservation of steps, conservation of domain vocabulary, elimination of technical vocabulary, and conservation of proper abstraction.
[^pact-intro]: [Pact](https://docs.pact.io/) defines consumer-driven contract testing as contract by example, with the consumer asserting only what it actually uses.
[^characterization-tests]: [Regression, Characterization, and Approval Tests](https://understandlegacycode.com/blog/characterization-tests-or-approval-tests/) distinguishes tests that capture actual behavior from tests that assert intended behavior.
