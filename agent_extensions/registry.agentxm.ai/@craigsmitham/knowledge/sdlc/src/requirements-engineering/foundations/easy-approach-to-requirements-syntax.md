---
type: Explanation
title: "EARS: preconditions, triggers, and system responses"
description: How the Easy Approach to Requirements Syntax constrains textual requirements through a temporally ordered clause structure and five keyword patterns, what its original case study did and did not show, where the syntax fits poorly, and how it relates to ISO/IEC/IEEE 29148, executable examples, and this bundle's requirement practice.
tags: [ears, easy-approach-to-requirements-syntax, alistair-mavin, controlled-natural-language, requirement-syntax, preconditions, triggers, unwanted-behaviour, requirement-quality, requirements-engineering]
status: draft
sources:
  - id: rental-specimens
    resource: https://github.com/craigsmitham/agent-extensions/blob/c56a54cb5cdb2c14c0d71801709c2b38968c99dd/knowledge/product-engineering/src/solution/requirements/authoring/northbank-commitment-requirements.md
    title: "Northbank commitments — original fictional requirements and witnesses"
  - id: mavin-ears-2009
    resource: https://doi.org/10.1109/RE.2009.9
    title: "Mavin, Wilkinson, Harwood & Novak — Easy Approach to Requirements Syntax (EARS), 17th IEEE International Requirements Engineering Conference (RE'09), 2009, pp. 317–322"
  - id: mavin-ears-site
    resource: https://alistairmavin.com/ears/
    title: Alistair Mavin — EARS (author's current guide)
  - id: ears-ctrl-2017
    resource: https://www.fortiss.org/forschung/ergebnisse/publikationen/details/just-formal-enough-automated-analysis-of-ears-requirements
    title: "Lúcio et al. — Just Formal Enough? Automated Analysis of EARS Requirements, NASA Formal Methods Symposium (NFM), 2017"
  - id: kiro-feature-specs
    resource: https://kiro.dev/docs/specs/feature-specs/
    title: Kiro — Feature Specs documentation
  - id: iso-29148-explainer
    resource: iso-iec-ieee-29148-requirement-quality.md
    title: "ISO/IEC/IEEE 29148: requirement and requirement-set quality"
  - id: selecting-method
    resource: ../authoring/selecting-a-specification-method.md
    title: Selecting a requirement specification method
generated: { by: codex/gpt-6, at: 2026-11-22T01:50:02Z }
---

# EARS: preconditions, triggers, and system responses

The Easy Approach to Requirements Syntax (EARS) is a small set of rules for
writing textual requirements. It keeps natural language but fixes the order of
a requirement's clauses and marks each kind of condition with a keyword:
*While* for a state, *When* for an event, *If … then* for unwanted behaviour,
and *Where* for an optional feature.[^mavin-ears-2009]

Changing *When a hold expires* to *While a hold is expired* looks like
a small edit to a rental requirement. The first phrase picks out a moment.
The second makes the obligation apply for as long as a condition holds.
What else does the choice of keyword decide, and what must the writer
still learn about the system?

## Where EARS came from

Alistair Mavin, Philip Wilkinson, Adrian Harwood, and Mark Novak developed EARS
at Rolls-Royce while extracting engine control system requirements from the
European Aviation Safety Agency's *Certification Specifications for Engines*,
section CS-E 50. That text had accumulated through incremental updates into long
paragraphs mixing explicit and implicit requirements with design guidance,
verification statements, and information. The engineers who would apply it were
mostly not trained in requirements definition.[^mavin-ears-2009]

The authors positioned EARS between unconstrained prose and other notations.
Formal notations such as Z and graphical notations such as SysML can add
precision, but translating stakeholder text into them can introduce errors,
create a language barrier with stakeholders, and require training. EARS took a
lighter route. The team started from loose rules of thumb that built on
Event-Condition-Action rules from active databases—*when* for events, *while*
for states, *if-then* for failures—and refined them as rewriting the source
text exposed cases they did not cover.[^mavin-ears-2009]

The paper states its own boundary. It concerns syntax; measures taken to improve
semantics are not described. It makes no claim that the approach suits every
level of system decomposition and calls it most suitable for high-level
stakeholder requirements.[^mavin-ears-2009]

## The problems it targets

The 2009 paper names eight problems that unconstrained natural language
introduces into requirements:[^mavin-ears-2009]

| Problem | What goes wrong |
| --- | --- |
| Ambiguity | A word, reference, or word order supports more than one reading |
| Vagueness | Precision, structure, or detail is missing |
| Complexity | Compound sub-clauses or interrelated statements share one requirement |
| Omission | A requirement is missing, particularly for unwanted behaviour |
| Duplication | Several requirements define the same need |
| Wordiness | More words are used than the requirement needs |
| Inappropriate implementation | The text says how to build the system rather than what it should do |
| Untestability | Satisfaction cannot be shown true or false in the implemented system |

It deliberately excluded conflicting requirements and missing traceability,
partly because they are not specific to natural language and partly because its
case study contained none. EARS therefore makes no direct claim about set-level
consistency.

## The generic form and why order matters

Every EARS requirement specializes one structure:

> *preconditions*, *trigger*, the *system name* shall *system response*

Mavin's current guide renders it as “While *optional precondition*, when
*optional trigger*, the *system name* shall *system response*” and states the
ruleset: zero or more preconditions, zero or one trigger, one system name, and
one or more system responses, always in that order.[^mavin-ears-site]

The order is not stylistic. The 2009 paper reads it as temporal logic:

1. The preconditions must hold, or the requirement can never become active.
2. The trigger must occur while those preconditions hold.
3. The system must produce the response if and only if both are
   satisfied.[^mavin-ears-2009]

That reading is what gives the syntax diagnostic force. An author who cannot
say which state applies, which event starts the obligation, or which subject
responds has found a gap in understanding rather than a wording problem.

EARS's terms map onto neighboring vocabularies without replacing them:

| EARS | ISO/IEC/IEEE 29148 | This bundle's [requirement template](../authoring/requirement-template.md) |
| --- | --- | --- |
| System name | Subject of the requirement | Obligated subject |
| Preconditions and trigger | Conditions that make the obligation assessable | “Under condition or trigger” |
| Shall | The conventional binding keyword | A normative verb consistent with local policy |
| System response | What the subject does, or the constraint on it | One bounded outcome, limit, or prohibition |

## How the five patterns change the obligation

Alongside the aircraft examples, consider Northbank, a fictional rental
company. Its allocation service assigns machines to reservations. A hold
keeps a machine available for one customer for a stated period. The
numbered rental rules come from an earlier worked case. Their EARS
versions below are illustrative rewrites.[^rental-specimens]

### Ubiquitous: always active

> The *system name* shall *system response*

A ubiquitous requirement has no precondition or trigger. The paper's example is
“The control system shall prevent engine overspeed.”[^mavin-ears-2009]

`NB-ALLOC-01` states that “an asset shall have no overlapping active allocations
or unexpired holds.” Its grammatical subject is the asset, which cannot be
obligated to do anything. EARS insists on naming a responding system:

> The allocation service shall prevent overlapping active allocations and
> unexpired holds for any asset in the controlled allocation scope.

Naming the subject is a real gain. It also exposes a limit discussed later: the
statement is an invariant over competing commands, and no single sentence
states the concurrency behavior that could falsify it.

### State-driven: *While*

> While *precondition(s)*, the *system name* shall *system response*

The response is required throughout a defined state. The paper's example is
“While the aircraft is in-flight, the control system shall maintain engine fuel
flow above XXlbs/sec.”[^mavin-ears-2009]

> While a hold is unexpired, the allocation service shall count the held asset
> as occupied for the hold's period.

### Event-driven: *When*

> When *trigger*, the *system name* shall *system response*

The response is required when an event is detected at the system boundary. The
paper's example is “When continuous ignition is commanded by the aircraft, the
control system shall switch on continuous ignition.”[^mavin-ears-2009]

> When an authorized replacement is committed, the allocation service shall
> preserve the reservation's identity, agreed period, price, and agreed
> capability constraints.

### Unwanted behaviour: *If … then*

> If *trigger*, then the *system name* shall *system response*

Unwanted behaviour covers failures, disturbances, deviations from desired user
behaviour, and unexpected behaviour of interacting systems. The authors gave it
distinct keywords because, in their experience, missing unwanted-behaviour
requirements were a major source of costly rework, and a separate form makes
those requirements findable throughout the life cycle. The paper's example is
“If the computed airspeed fault flag is set, then the control system shall use
modelled airspeed.”[^mavin-ears-2009]

> If replacement persistence is interrupted, then the allocation service shall
> preserve the prior assignment and allocation state.

### Optional feature: *Where*

> Where *feature is included*, the *system name* shall *system response*

The requirement applies only to products or configurations that include the
feature. The paper's example begins “Where the control system includes an
overspeed protection function…”[^mavin-ears-2009]

Northbank's partner-asset proposal shows the pattern's value for incomplete
work:

> Where partner-depot replacement is included, the allocation service shall
> *[hold-expiry and unknown-outcome response undecided]*.

The template makes the undecided response visible. It does not supply the
timeout Northbank has not chosen, and an author should not invent one to
complete the sentence.

## Combining keywords

Complex requirements combine keywords. The 2009 example is “While the aircraft
is on-ground, when reverse thrust is commanded, the control system shall enable
deployment of the thrust reverser.” The same event produces different required
responses in different states, and unwanted-behaviour requirements can nest
the other keywords: “While the aircraft is in-flight, if reverse thrust is
commanded, then the control system shall inhibit thrust reverser
deployment.”[^mavin-ears-2009]

In the rental case, a dispatcher tries to replace machine A on reservation
R-42 with machine B. B is already committed for the same period. The
case's example checks that the service reports a conflict and R-42 has
no new assignment to B. An EARS statement can express the more general
obligation illustrated by that one attempt.[^rental-specimens]

> While a reservation is assigned to an asset, if the replacement asset cannot
> be secured for the agreed period, then the allocation service shall report
> the conflict and retain the existing assignment.

Combination has a practical ceiling. Each added precondition lengthens the
sentence and multiplies the situations a reader must hold in mind. The paper's
own residual wordiness came from long requirements containing numerous
conditional clauses. When conditions start to accumulate, the rules usually
want a table.

## Judgments the syntax does not make

EARS asks authors to classify each requirement. Several of those classifications
depend on a modeling choice rather than on the requirement's wording.

**Wanted and unwanted behaviour are a viewpoint.** The paper's own footnote
observes that a redundant safety-critical subsystem accommodating a failure is
behaving normally, yet its requirements would be classed as unwanted behaviour.
The authors call the distinction “a matter of viewpoint, or even a matter of
‘style.’”[^mavin-ears-2009] The keyword choice should make recovery obligations
findable, not settle a debate about whether a situation is abnormal.

**Triggers and states can describe the same situation.** “When a hold expires”
is an event; “while a hold is expired” is a state. The event form obligates a
response at a moment; the state form obligates it for a duration. Choosing
between them affects what a later observation can establish. An expired
hold still present tomorrow can violate a continuing state constraint even
if no one saw the instant it expired.

**EARS permits several responses.** The ruleset allows one or more system
responses, while ISO/IEC/IEEE 29148 expects each requirement to be
singular.[^iso-29148-explainer] The two need not conflict: the 29148 test is
whether the obligations could be decided and assessed independently. They do
conflict when authors split mechanically.

`NB-REPLACE-01` shows the danger. Replacement shall *either* secure the new
allocation and update the assignment together, *or* preserve the prior state.
It is tempting to write two EARS requirements:

> When a replacement allocation is secured, the allocation service shall update
> the reservation's assignment.
>
> If a replacement allocation cannot be secured, then the allocation service
> shall preserve the prior assignment and allocation state.

Suppose securing the replacement and updating the assignment are separate
writes. Both complete, so the success response occurs and the failure
condition never applies. Between the writes a staff member can still see
the replacement allocated to a reservation that names the old machine.
The original rule forbids even that intermediate result. This guarantee
about every observable state belongs with [authoring invariants and stateful behavior](../authoring/authoring-invariants-and-stateful-behavior.md).

**A state can sometimes rescue an ordering rule.** `NB-MIGRATE-01` requires one
allocation writer *before* admitting replacement commands for a migrated
cohort. “Before” resists the patterns, but restating the rule as a state works:

> While a migrated group of reservations lacks exactly one authorized
> allocation writer, the service shall reject replacement commands for
> that group.

The rewrite is not automatically equivalent. It must still be checked against
the source: it says nothing about preserving customer terms, which remains a
separate obligation in the same specimen.

## How the syntax has changed

Comparing the 2009 paper with Mavin's current guide shows refinement rather
than redesign:[^mavin-ears-2009][^mavin-ears-site]

| Aspect | RE'09 paper | Current guide |
| --- | --- | --- |
| Generic form | *optional preconditions* *optional trigger* the *system name* shall *system response* | While *optional precondition*, when *optional trigger*, the *system name* shall *system response* |
| Event-driven template | `WHEN <optional preconditions> <trigger>` | `When <trigger>`, with state preconditions carried by *While* |
| Readability alias | *During* permitted as an equivalent of *While* | Not listed |
| Examples | Aero engine control | Everyday products: phones, ATMs, laptops, cars, websites |
| Unwanted states | Future work: the authors suspected an additional template might be needed | Not listed as a separate pattern |

Separating the state keyword from the event keyword makes every precondition a
visible *While* clause. The broadening of examples matches the method's spread
beyond aerospace.

## Evidence and its limits

The 2009 case study rewrote 36 requirements extracted from CS-E 50, which the
team split into 47 EARS requirements while average length fell from 36.9 to
25.6 words. Safety and airworthiness specialists helped interpret the
source. The authors counted eight kinds of problem before and after the
rewrite. In that
sample, the rewritten requirements showed no instances of complexity, omission,
duplication, inappropriate implementation, or untestability, and fewer
instances of ambiguity, vagueness, and wordiness.[^mavin-ears-2009]

The authors qualified these results:

- Thirty-six source requirements is a small sample.
- Only high-level, safety-related requirements were studied; other kinds and
  lower levels might not fit the notation.
- Classifying vagueness is subjective and open to inconsistency.
- The apparent elimination of omission should be treated with caution: the
  rewrite identified some unwanted behaviour, but there was no evidence that
  other missing requirements had been found.
- Some requirements that did not fit were manipulated to fit, or the ruleset
  evolved to accommodate them.[^mavin-ears-2009]

The authors attributed the residual ambiguity to inferred preconditions and
the residual vagueness to high-level requirements awaiting design decisions. Syntax could not supply knowledge the authors did not yet have.

Mavin's guide reports adoption by organizations including Airbus, Bosch, Dyson,
Honeywell, Intel, NASA, Rolls-Royce, and Siemens, and claims particular benefit
for authors whose first language is not English.[^mavin-ears-site] Adoption
lists show that practitioners find EARS worth using; they are not controlled
evidence that EARS improves outcomes. This explanation did not consult the
authors' later experience reports, listed under reading routes.

## Where EARS fits poorly

EARS constrains sentences, so it inherits the limits of sentences. The
[specification-method guide](../authoring/selecting-a-specification-method.md)
already routes these needs elsewhere:[^selecting-method]

| Requirement shape | Why EARS strains | Better primary form |
| --- | --- | --- |
| Many interacting conditions | Each combination becomes another long sentence, and gaps between sentences are hard to see | Decision table or example table |
| Invariants across concurrency, retry, or partial failure | A single trigger and response cannot state what must never be observable | State model, transition table, or invariant |
| Idempotency and replay, as in `NB-REPLAY-01` | Identity, input equality, and retention windows stack as preconditions | Invariant with explicit scope, supported by examples |
| Data relationships, limits, and formulas | The response becomes a formula dressed as prose | Schema, table, or mathematical expression |
| Quality requirements measured over populations and windows | The condition is a measurement definition rather than a state or event | [Quantitative and quality requirements](../authoring/authoring-quantitative-and-quality-requirements.md) |

Text and model can coexist. An EARS statement can name the obligation while a
linked table or model carries the rule combinations, provided the requirement
record says which representation is authoritative.

## EARS beside neighboring forms

**ISO/IEC/IEEE 29148 language criteria.** EARS is one way to satisfy the
standard's concern with unambiguous, singular, verifiable text, not a
replacement for its characteristics. A requirement can follow EARS perfectly
and still be unnecessary, infeasible, or incorrect.[^iso-29148-explainer] The
2009 paper's own rewrites use *shall not*, which 29148's drafting conventions
discourage; this bundle treats prohibition as an explicit normative force
rather than a grammar error.

**Given–When–Then examples.** EARS *When* and Gherkin *When* look alike but do
different jobs. An EARS requirement states a rule for every situation matching
its conditions. A Given–When–Then scenario illustrates one path with concrete
data. Northbank's `NB-REPLACE-01` witness is one example of the rule, not the
rule. [Executable specifications](../../software-testing/patterns/executable-specifications.md)
owns when a rule earns an executable witness.

**User stories and use cases.** Stories and use cases express actor goals and
paths through an interaction. EARS statements can serve as the precise
obligations beneath them, including the unwanted-behaviour extensions that
scenarios often omit.

**Formal analysis.** EARS itself is informal: its semantics live in the prose
reading of its clauses. EARS-CTRL adds a glossary of controller terms and a
projectional editor so requirements are well formed by construction, then uses
controller synthesis to check whether a set of requirements can be realized as
a controller.[^ears-ctrl-2017] That is the direction to take when syntax alone
cannot establish consistency or realizability.

**AI-assisted specification tools.** Kiro's feature-spec documentation illustrates
acceptance criteria with the template “WHEN [condition/event] THE SYSTEM SHALL [expected
behavior],” citing clarity, testability, traceability, and
completeness.[^kiro-feature-specs] That is the event-driven pattern alone. A
workflow restricted to it has no distinct place for states, optional features,
or unwanted behaviour, which is where the 2009 authors located costly
omissions.

## Failure modes

- **Template compliance as quality** — treating a sentence that fits a pattern
  as correct, necessary, or verified.
- **Hollow clauses** — filling *While* or *When* with a restatement of the
  response, or with a condition no one can observe.
- **Hidden unknowns** — inventing a trigger, state, or limit to complete the
  sentence instead of recording an open decision.
- **Mechanical splitting** — breaking an atomic rule into trigger–response
  pairs that can each pass while the intended rule fails.
- **Forced fit** — stacking preconditions where a table, model, or invariant
  would expose the rule.
- **Keyword substitution** — importing *shall* over a local normative
  convention, or treating *If … then* as proof that unwanted behaviour has been
  covered.
- **Event-only adoption** — using *When* for everything and losing the state,
  feature, and unwanted-behaviour distinctions that motivated the method.

## Reading routes and source basis

This explanation was prepared from the full text of the RE'09 paper and
Mavin's current EARS guide. The EARS-CTRL account relies on the paper's
published summary, and the Kiro account on its current documentation.
Northbank rewrites, the vocabulary mapping, and the comparisons with this
bundle are original synthesis.

| Reading purpose | Source |
| --- | --- |
| Origin, ruleset rationale, case study, and stated limits | Mavin et al., RE'09[^mavin-ears-2009] |
| Current templates and examples | Mavin's EARS guide[^mavin-ears-site] |
| Tool-enforced well-formedness and realizability analysis | Lúcio et al., NFM 2017[^ears-ctrl-2017] |

The authors' later experience reports were not consulted for this draft and
should be read before extending its claims about practice:

- Mavin and Wilkinson, “Big Ears (The Return of Easy Approach to Requirements
  Engineering),” RE'10, pp. 277–282, doi:10.1109/RE.2010.39.
- Mavin, Wilkinson, Gregory, and Uusitalo, “Listens Learned (8 Lessons Learned
  Applying EARS),” RE'16, pp. 276–282, doi:10.1109/RE.2016.38.
- Mavin et al., “Ten Years of EARS,” *IEEE Software*, 2019,
  doi:10.1109/MS.2019.2921164.

## Continue exploring

- [Selecting a requirement specification method](../authoring/selecting-a-specification-method.md)
  chooses between EARS-like syntax and other forms.
- [Requirement content contract](../authoring/requirement-content-contract.md)
  drafts a single obligation with its sources, authority, and conditions.
- [ISO/IEC/IEEE 29148: requirement and requirement-set quality](iso-iec-ieee-29148-requirement-quality.md)
  supplies the quality characteristics an EARS statement still has to meet.
- [Authoring invariants and stateful behavior](../authoring/authoring-invariants-and-stateful-behavior.md)
  handles the rules that trigger–response sentences cannot hold.

[^mavin-ears-2009]: Mavin, Wilkinson, Harwood & Novak, Easy Approach to
    Requirements Syntax (EARS), RE'09, pp. 317–322: §2 for problems and
    scope, §4 for the ruleset and patterns (footnote 2 on unwanted behaviour),
    §5–§6 for results and limitations, §7 for future work.
[^mavin-ears-site]: Alistair Mavin, [EARS guide](https://alistairmavin.com/ears/).
[^ears-ctrl-2017]: Lúcio et al., [Just Formal Enough? Automated Analysis of EARS Requirements](https://www.fortiss.org/forschung/ergebnisse/publikationen/details/just-formal-enough-automated-analysis-of-ears-requirements), published summary, NFM 2017.
[^kiro-feature-specs]: Kiro, [Feature Specs](https://kiro.dev/docs/specs/feature-specs/), “Requirements with EARS Notation.”
[^iso-29148-explainer]: This bundle's
    [29148 explanation](iso-iec-ieee-29148-requirement-quality.md#characteristics-of-an-individual-requirement),
    including the note that singular permits several conditions.
[^selecting-method]: This bundle's
    [specification-method guide](../authoring/selecting-a-specification-method.md).

[^rental-specimens]: [Northbank commitments, original fictional specimens](https://github.com/craigsmitham/agent-extensions/blob/c56a54cb5cdb2c14c0d71801709c2b38968c99dd/knowledge/product-engineering/src/solution/requirements/authoring/northbank-commitment-requirements.md).
