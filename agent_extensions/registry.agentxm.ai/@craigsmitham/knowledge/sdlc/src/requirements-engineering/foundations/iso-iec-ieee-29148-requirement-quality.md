---
type: Explanation
title: "ISO/IEC/IEEE 29148: requirement and requirement-set quality"
description: How ISO/IEC/IEEE 29148:2018 characterizes well-formed requirements and requirement sets through its construct, quality characteristics, language criteria, attributes, and conformance claims, and where this bundle's requirements practice follows, extends, or departs from it.
tags: [iso-iec-ieee-29148, requirements-engineering, requirement-quality, requirement-set, well-formed-requirements, language-criteria, requirement-attributes, conformance, verification, validation, requirements-engineering]
status: draft
sources:
  - id: rental-specimens
    resource: https://github.com/craigsmitham/agent-extensions/blob/c56a54cb5cdb2c14c0d71801709c2b38968c99dd/knowledge/product-engineering/src/solution/requirements/authoring/northbank-commitment-requirements.md
    title: "Northbank commitments — original fictional requirements and witnesses"
  - id: iso-29148
    resource: https://www.iso.org/standard/72089.html
    title: ISO/IEC/IEEE 29148:2018 Systems and software engineering — Life cycle processes — Requirements engineering
  - id: authoring-requirements
    resource: https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/requirements-engineering/src/authoring/authoring-requirements.md
    title: Authoring requirements
  - id: reviewing-individual
    resource: ../review/reviewing-individual-requirements.md
    title: Reviewing individual requirements
  - id: reviewing-sets
    resource: ../review/reviewing-requirement-sets.md
    title: Reviewing requirement sets
generated: { by: codex/gpt-6, at: 2026-11-22T01:50:02Z }
---

# ISO/IEC/IEEE 29148: requirement and requirement-set quality

ISO/IEC/IEEE 29148 is the international standard for requirements engineering
in systems and software life cycles. It elaborates the requirements-related
processes of ISO/IEC/IEEE 15288 and 12207, names the information items those
processes produce, and states what makes an individual requirement and a set
of requirements well formed.[^iso-29148]

A reviewer can find every sentence clear and testable and still have
reason to withhold acceptance. A requirement may describe the wrong
capability with perfect precision. A collection of correct requirements
may omit the moment when a failed reservation has to be recovered. Why
does quality change when the reviewer looks beyond the sentence?

The account follows the second edition, published in November 2018 and
confirmed by ISO in 2024. The standard is copyrighted and sold by ISO and IEEE.
Everything here is an original paraphrase with clause references; consult the
licensed text for exact wording before claiming conformance.

## What the standard covers

The standard's normative core has four parts:

| Part | Clauses | What it supplies |
| --- | --- | --- |
| Terms | Clause 3 | Definitions, including verification and validation adapted from ISO 9000 |
| Concepts | Clause 5 | Requirement fundamentals: stakeholders, transformation of needs, the requirement construct, quality characteristics, language criteria, and attributes |
| Processes | Clause 6 | Requirements work within business or mission analysis, stakeholder and system requirements definition, architecture, verification, validation, and management |
| Information items | Clauses 7–9, Annexes A–B | The business, stakeholder, system, and software requirements specifications and the content each should carry |

The quality concepts sit in the middle of that structure. Needs start as
stakeholder concerns that are not yet requirements, because they usually lack
analysis, consistency, or feasibility. Requirements engineering refines them
into statements that satisfy the construct and the characteristics, then
recurses through lower system levels, where earlier design decisions become new
sources of requirements (§5.2.3).

## The requirement construct

The standard treats a requirement as a statement that expresses a need together
with its conditions and constraints (§5.2.4). A natural-language requirement
names its **subject**, such as the system or software, and says either what that
subject must do or what constraint applies to it. Use cases and condition–action
tables are acknowledged alternatives to sentences.

Three terms keep the statement from absorbing everything around it:

| Element | Role in the standard | Rental illustration |
| --- | --- | --- |
| **Condition** | A measurable qualifier that makes the obligation assessable and may narrow design options | “for a reservation within the controlled depot scope” |
| **Constraint** | A restriction on the solution or the engineering process; it may bound one requirement, a group, or stand alone | An existing fleet interface whose message format cannot change |
| **Attribute** | Descriptive information that travels with the requirement but is not the obligation, such as rationale or priority | “Requested after double-booking incidents in the spring season” |

The construct also limits whose capability a requirement describes. A system
requirement states what the system does or how well it performs for a
stakeholder, not what the user or operator must be able to do.

The standard recommends agreeing keywords in advance. Its common convention
reserves *shall* for binding requirements; uses *should* for goals, *may* for
allowances, and *will* for facts or purpose; and treats descriptive verbs such as
*is* as non-binding. It advises avoiding *must* because readers may disagree
about its force, preferring positive statements over *shall not*, writing in the
active voice, and avoiding *shall be able to*. A note accepts that agile teams
may express requirements as user stories without *shall*.

These are conventions to adopt, not a grammar test. What matters is that every
reader can tell a binding obligation from context, preference, or explanation.

## Characteristics of an individual requirement

Clause 5.2.5 lists nine characteristics that each stakeholder, system, and
system element requirement is expected to possess. Each suggests a question a
reviewer can put to one requirement:

| Characteristic | Question it asks |
| --- | --- |
| **Necessary** | Would removing it leave a gap that no other requirement fills, and is it still applicable today? |
| **Appropriate** | Is its intent and detail pitched at the level of the entity it constrains, leaving design freedom below? |
| **Unambiguous** | Can it reasonably be read only one way, simply? |
| **Complete** | Can the capability, characteristic, constraint, or quality be understood without hunting for more information? |
| **Singular** | Does it state one capability, characteristic, constraint, or quality? |
| **Feasible** | Can it be realized within cost, schedule, and technical limits at acceptable risk? |
| **Verifiable** | Is it worded so its realization can be shown to the customer's satisfaction at its own level? |
| **Correct** | Does it faithfully represent the need it was derived from? |
| **Conforming** | Where an approved template or style applies, does it follow it? |

Several characteristics carry clarifications that change how they are applied.

**Necessary includes time.** A requirement that was essential for a previous
release but has been overtaken is no longer necessary. Requirements with known
expiry or start dates should say so.

**Appropriate is about level, not brevity.** The standard warns that embedding a
design solution can eliminate better alternatives. Naming a specific product,
stating tolerances deep inside a component from a top-level requirement, or
imposing constraints the parent requirement does not justify are its examples
of inappropriate detail. Supporting information still matters; it moves into
attributes such as rationale rather than into the obligation.

**Singular permits several conditions.** One function, quality, or constraint may
apply under multiple conditions without becoming several requirements. The test
is whether the obligations could be decided and assessed independently, not
whether the sentence contains more than one clause.

**Verifiable is strengthened by measurement but not identical to it.** A
requirement can be verifiable by inspection or demonstration; measurability
makes verification sharper.

**Correct and verifiable look in different directions.** Verifiability faces
forward to the realization; correctness faces back to the source need. A
requirement can be perfectly testable and still misstate what stakeholders
needed.

## Characteristics of a set of requirements

Clause 5.2.6 adds five characteristics that belong to a set of requirements for
a system, software, or service, rather than to any member:

| Characteristic | Question it asks of the set |
| --- | --- |
| **Complete** | Does the set stand on its own for the entity's needs, with no unresolved to-be-determined, to-be-specified, or to-be-resolved placeholders? |
| **Consistent** | Are its requirements unique and non-overlapping, free of conflicts, and expressed in one system of units and one vocabulary? |
| **Feasible** | Can the whole set be realized within constraints at acceptable risk, including being affordable? |
| **Comprehensible** | Is it clear what is expected of the entity and how the entity relates to the larger system it belongs to? |
| **Able to be validated** | Is it practicable that satisfying the set will achieve the entity's needs within cost, schedule, technical, legal, and regulatory limits? |

Individually well-formed requirements do not guarantee a well-formed set. Two
feasible requirements can be jointly infeasible; two unambiguous requirements
can use the same term for different things; every requirement can be correct
while the set omits a lifecycle stage entirely.

The standard's treatment of completeness is precise and demanding. A set
containing any open placeholder is not complete. Placeholders are normal while
analysis and trade-offs continue, and the standard expects a timeframe for
resolving each according to risk and dependencies, but a set is not called
complete until they are resolved. To improve completeness it suggests covering
every relevant requirement type, every life-cycle stage, and every stakeholder
group during elicitation. It also notes that a set can be complete for a system
built from off-the-shelf or open-source components even when those components
have functions the system never uses.

The standard ties careful set-level checking to avoiding requirements creep:
changes discovered late cost schedule and quality that early checking could
have saved.

## Language criteria

Clause 5.2.7 describes wording practices that help textual requirements achieve
the characteristics. Its first principle is to state what the subject needs,
not how it will be designed, while accepting that design decisions made at a
higher level legitimately appear in lower-level requirements.

It then identifies kinds of vague or unbounded language that make requirements
hard to verify or open to several readings:

| Kind of language | Why it weakens a requirement | Rental illustration and repair |
| --- | --- | --- |
| Superlatives and subjective terms | Readers apply private standards | “the easiest booking flow” → name the task, user group, and acceptable completion rate |
| Vague pronouns | The subject or object is lost | “it shall be released” → name the hold or the asset |
| Imprecise adverbs, adjectives, and logical connectives | The boundary or the satisfying combinations are unclear | “minimal delay”, “deposit and/or ID” → state the bound; state the logic or split |
| Open-ended phrases | The scope of the obligation and of verification cannot be known | “support payment methods including but not limited to cards” → enumerate or reference a controlled list |
| Comparatives | The baseline and degree are missing | “faster than today” → name the baseline measurement and target |
| Loopholes | The condition that makes the obligation binding is undefined | “notify the customer where possible” → state the actual condition |
| Totality terms | Proof may be impractical or the claim infeasible | “never double-book any asset” → bound the scope and interval model |
| Incomplete references | The controlling text cannot be identified | “comply with the fleet API” → pin the version and the relevant sections |

A note on connectives recommends considering separate requirements when *or*,
*and*, or *and/or* appear. Read it as a prompt, not a prohibition: some atomic
rules genuinely require a disjunction.

The clause closes with two placement rules. Assumptions behind a requirement
are documented and validated in an attribute, such as rationale, or in an
accompanying document. Definitions are written as declarative statements, not
disguised as requirements.

## Attributes that support quality

Clause 5.2.8 recommends attaching descriptive attributes so that requirements
can be found, understood, and managed. The standard's examples connect directly
to the characteristics:

| Attribute | What it records | Quality it helps establish or monitor |
| --- | --- | --- |
| **Identification** | A unique identifier that is never changed or reused | Traceability; consistency checks for duplicates |
| **Version** | The requirement's revision | Correct implementation of the current text; volatility as a risk signal |
| **Owner** | Who maintains it, approves changes, and reports status | Accountability for correctness and necessity |
| **Stakeholder priority** | Relative priority, ideally agreed among stakeholders | Trade decisions without implying lower-priority items are unnecessary |
| **Risk** | Risk from missing characteristics or from technology, cost, schedule, or politics; possibly inherited from a parent | Feasibility; early warning of verification or validation failure |
| **Rationale** | Why the requirement exists and the analysis behind it | Necessity and correctness; a home for assumptions |
| **Difficulty** | Assumed difficulty | Feasibility and affordability of the set |
| **Type** | The kind of property represented | Grouping for analysis, allocation, and specialist review |

The type examples include functional and performance, interface, process,
quality, usability or quality in use, and human factors. The standard observes
that a performance requirement on its own is incomplete: performance qualifies
a function. For software quality requirements it points to ISO/IEC 25030 and
25010.

The attribute clause uses *should*, and the standard's full-conformance claim
cites §5.2.4 through §5.2.7 but not §5.2.8. Attributes are strongly recommended
support rather than a conformance condition in their own right.

## Verification and validation

The standard adapts both definitions from ISO 9000. **Verification** confirms
with objective evidence that specified requirements are fulfilled—the system
was built right. **Validation** confirms with objective evidence that
requirements for an intended use are fulfilled—the right system was built
(§3.1.36–3.1.37).

The quality characteristics make both possible. *Verifiable* requirements let a
realization be checked; a set that is *able to be validated* makes it
practicable to show that meeting the requirements achieves the need. Clause
6.5.2 asks that a verification method be associated with each requirement as it
is created and documented, for example in a verification and traceability
matrix. That method says how, where, when, and by whom compliance will be
shown, using inspection, analysis, demonstration, or test. Clause 6.5.3 scopes
validation against the operational concept and baselined stakeholder
requirements.

## What a conformance claim establishes

Clause 4 lets a user claim conformance to the process provisions, the
information-item provisions, or both:

| Claim | What must be shown |
| --- | --- |
| **Full conformance** | The provisions of §5.2.4–§5.2.7; the requirements-related 15288 and 12207 processes cited in §6.1; the information items of Clause 7; and their content under Clause 9 and Annex A |
| **Process conformance** | The process requirements in §6.1 |
| **Information-item conformance** | The required items are produced and their content meets the stated requirements |
| **Tailored information-item conformance** | For information items, §4.5.2 requires the Annex C tailoring process, declaration of the tailored text, and evidence that its requirements were met. Section 4.5.1 points to 15288 or 12207 for process tailoring |

Two notes prevent common misreadings. Conformance to ISO/IEC/IEEE 15289 does
not imply conformance to this standard's information items, because 29148 adds
items. And information items need not be separate published documents: they may
live in a repository, be split, or be combined.

A conformance claim is bounded. It says that stated provisions were satisfied
for the declared scope and tailoring. It does not show that the requirements
capture the right product, that stakeholders will value the result, or that a
lightweight team's artifacts are inadequate because they do not resemble the
templates. For the reasoning behind that distinction, see *Standard authority and conformance*
(`@craigsmitham/knowledge/docs#explainers/standard-authority-and-conformance`).

## How this bundle relates to the standard

This bundle's requirements practice was written as portable craft, not as a
conformance profile. It shares most of the standard's quality vocabulary, adds
authority concerns the standard leaves to project governance, and differs in a
few places that readers should notice. The following comparison is this
bundle's synthesis.

### Characteristics

This explanation defines the standard's individual and set characteristics.
[Reviewing individual requirements](../review/reviewing-individual-requirements.md)
selects those characteristics directly, alongside the artifact's content and
authority contract. [Reviewing requirement sets](../review/reviewing-requirement-sets.md)
adds scope, relationship, and maintenance checks.

Set completeness remains relative to declared sources, scope, assumptions,
method, and date; the standard's stronger completeness criterion also excludes
unresolved placeholders. Its comprehensibility and validation-feasibility
characteristics require assessment in addition to source coverage. Traceability,
modifiability, and balance remain useful bundle checks without becoming named
29148 set characteristics. These mappings do not claim conformance to the
standard as a whole.

### Structure and management

| Topic | Standard | Bundle |
| --- | --- | --- |
| Open questions | Placeholders prevent a set from being complete | Open questions and assumptions are required content; incompleteness is reported rather than hidden |
| Identity | An identifier never changes, even when the requirement changes | [Identity and lineage](../lifecycle/maintaining-requirement-identity-and-lineage.md) keeps identity for clarifying edits but creates successors when meaning or subject materially changes |
| Classification | Type examples include a quality (non-functional) type | [Classifying requirements](../authoring/classifying-requirements.md) uses non-exclusive lenses and discourages a residual “non-functional” bucket |
| Binding language | *shall* binds; avoid *must* and *shall not* | The normative verb follows local policy; prohibition is an explicit normative force |

The identity difference is substantive. Under the standard, a requirement whose
meaning changes keeps its identifier and gains a version. Under this bundle, a
material change in meaning produces a successor identity so that evidence
gathered for the old obligation is not silently attributed to the new one. Both
preserve history; they place the boundary differently. A project adopting 29148
conformance would need to reconcile the two explicitly.

The preference for positive wording also deserves context. Stating a prohibition
positively is often clearer, but some obligations—such as never initiating a
second charge on replay—are most faithfully expressed as prohibitions. The
standard frames this as a drafting preference, and the bundle's explicit
normative-force dimension keeps prohibitions visible when they are genuine.

## Applying the characteristics to a Northbank requirement

Consider a fictional rental depot. When an assigned machine breaks down,
staff can try to secure a replacement for the agreed rental period. The
depot accepted one rule for the change. Either the replacement is secured
and the reservation's assignment changes with it, or the original assignment
and allocation both stay in place. Staff may still have to find another
machine. Preserving the records avoids losing track of the commitment
while they do so.[^rental-specimens]

| Characteristic | Judgment and what it exposes |
| --- | --- |
| Necessary | Without it, a failed replacement could leave a reservation assigned to nothing; no other specimen prevents that |
| Appropriate | It states the outcome at the allocation boundary and leaves transactions, locks, and retries to engineering |
| Unambiguous | “Preserve” needed the stated condition that preservation does not assert the former machine is usable |
| Singular | It contains *or*, which the language criteria flag. Splitting it would destroy the rule: the disjunction *is* the atomic obligation |
| Verifiable | One example checks that the failed attempt made no new assignment to the conflicting machine. A storage interruption is a different path and needs its own evidence |
| Correct | Depot staff needed the old assignment to remain visible until a replacement was secured. The accepted rule preserves that commitment |
| Conforming | The original case records an identifier, the obligation, and its conditions, as its local template requires |

Now suppose a partner depot owns the replacement. How long will that depot
hold a machine, and what happens if it accepts a request but its reply
never arrives? Those decisions remain open in the case. The same clear
replacement rule can belong to a set with unresolved obligations as soon
as its scope includes partner depots. Even within the original depot,
feasibility depends on who else can allocate that machine. Another writer
able to take it during replacement could defeat the guarantee.[^rental-specimens]

## Limits and failure modes

- **Checklist compliance** — marking every characteristic as satisfied without
  evidence, or treating a well-worded requirement as a correct one.
- **Absolute completeness** — claiming a set is complete without declaring its
  scope, or hiding unresolved decisions to avoid visible placeholders.
- **Mechanical splitting** — breaking an atomic rule at every *and* or *or*,
  creating requirements that can each pass while the intended rule fails.
- **Keyword substitution** — replacing *must* with *shall* while leaving the
  obligation vague, or removing *shall* from a genuine obligation to make it
  sound collaborative.
- **Template conformance as quality** — producing specification documents in
  the standard's shape while the requirements in them lack the characteristics.
- **Level confusion** — rejecting a lower-level requirement as design detail when
  it records an accepted higher-level decision, which the standard explicitly
  allows.
- **Stale conformance** — citing a superseded edition, or claiming conformance
  without declaring the tailoring applied.

## Reading routes and source basis

This explanation was prepared from a licensed copy of ISO/IEC/IEEE 29148:2018
(second edition, 2018-11). Clause references let readers with access locate the
normative text. Rental illustrations, the Northbank application, and the
comparison with this bundle are original synthesis.

| Reading purpose | Clauses |
| --- | --- |
| Conformance options and tailoring | Clause 4; Annex C |
| Requirement construct, characteristics, language, and attributes | §5.2.4–§5.2.8 |
| Iteration, recursion, and levels of abstraction | §5.2.3; §5.3 |
| Requirements work in verification and validation | §6.5.2–§6.5.3 |
| Specification content | Clauses 7–9; Annexes A–B |

The standard is a consensus account of requirements practice, not empirical
evidence that applying its characteristics improves outcomes for every team.

## Continue exploring

- [Requirement content contract](../authoring/requirement-content-contract.md)
  applies the characteristics while drafting one obligation.
- [Reviewing individual requirements](../review/reviewing-individual-requirements.md)
  and [Reviewing requirement sets](../review/reviewing-requirement-sets.md)
  turn them into scaled review checks.
- [Authoring quantitative and quality requirements](../authoring/authoring-quantitative-and-quality-requirements.md)
  develops measurable conditions for quality types.

- [EARS](easy-approach-to-requirements-syntax.md) explains a lightweight
  syntax for conditional *shall* statements and where it meets the
  singular characteristic.

[^iso-29148]: ISO/IEC/IEEE 29148:2018, *Systems and software engineering — Life
    cycle processes — Requirements engineering*, second edition, 2018-11,
    confirmed 2024. Clauses 1, 3–5, 6.5.2–6.5.3; Annex C.

[^rental-specimens]: [Northbank commitments, original fictional specimens](https://github.com/craigsmitham/agent-extensions/blob/c56a54cb5cdb2c14c0d71801709c2b38968c99dd/knowledge/product-engineering/src/solution/requirements/authoring/northbank-commitment-requirements.md).
