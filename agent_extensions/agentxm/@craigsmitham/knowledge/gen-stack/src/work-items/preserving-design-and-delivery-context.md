---
type: Guide
title: Preserving design and delivery context in software work items
description: Use when supplied design or delivery context must survive transfer into a software work item; retain findings, constraints, decisions, sketches, plans, testing strategies, tradeoffs, and open questions without inventing or approving missing work.
tags: [work-item-context, specification, change-specification, bugfix-specification, technical-design, architecture-sketch, code-sketch, implementation-plan, testing-strategy, decision-status, issue-body]
status: draft
sources:
  - id: change-design
    resource: ../design/change-design.md
    title: Change Design
  - id: google-design-docs
    resource: https://abseil.io/resources/swe-book/html/ch10.html
    title: Google Software Engineering — Design Docs
  - id: kubernetes-kep-template
    resource: https://github.com/kubernetes/enhancements/blob/master/keps/NNNN-kep-template/README.md?plain=1
    title: Kubernetes Enhancement Proposal template
  - id: aws-adr
    resource: https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html
    title: AWS Prescriptive Guidance — ADR process
  - id: mozilla-rfc-template
    resource: https://firefox-source-docs.mozilla.org/mobile/android/rfcs/0000-template.html
    title: Mozilla RFC template
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T20:14:40Z
---

# Preserving design and delivery context in software work items

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Use this guide when source material for a Defect Report, Change Specification,
or other work item already contains technical investigation, design, planning,
or test detail. It governs faithful capture, not invention or approval of that
detail.

When the response still needs to be reasoned through, use [Developing a Change
Design](../design/developing-a-change-design.md) first. A Change Design is the
bounded technical response, not a required standalone document; this guide
preserves it when a work item is the chosen durable home.[^change-design]

Use [Preserving evidence and authority in software work
items](preserving-work-item-evidence-and-authority.md) for the source inventory,
claim maturity, safe evidence, and decision-authority mechanics. This guide
specializes that foundation for technical design and delivery material.

## Representation

Use the work item's native fields and links first, then retain residual design
and delivery meaning in this preferred order: context and scope, applicable and
candidate Requirements, affected Architecture and decisions, Change Design,
verification context, delivery work, then open questions and authority. The
compositions below are adaptable body fallbacks, not mandatory templates.
Omit unsupported sections, link independent authorities, and never duplicate
host fields or promote a sketch, proposal, or plan through formatting alone.

## Core rule

**Preserve before prescribing.** A work-item type defines the artifact's
primary meaning and minimum useful content; it is not a ceiling on its body.
When supplied or discoverable source material already contains findings,
constraints, decisions, proposals, architecture or code sketches,
implementation sequence, testing strategy, tradeoffs, or open questions,
include or link the material needed to retain its meaning.

Do not fill an empty section by designing the missing solution. Do not infer
authority from detail: a concrete code sketch may still be illustrative, while
a one-sentence constraint may be binding.

## Use a Specification as a composition

A work item may serve as a **Specification container** when it intentionally
composes several representations needed to understand and deliver its bounded
change. Calling it a Specification helps name the whole without turning the
whole into a new authority. Preserve the identity and status of each
constituent rather than flattening everything into undifferentiated prose.

| Scope name | Typical composition | Boundary to preserve |
| --- | --- | --- |
| Change Specification | Motivating Signals, Observations, source context, or Intent; affected System or Architecture; applicable or candidate Requirements; Change Design; verification context; delivery work | A proposed change is not accepted or authorized merely because it appears in the Specification |
| Bugfix Specification | Linked Defect reports; Bug and diagnosis synopsis; correction decision and authority; applicable or candidate Requirements; unchanged constraints; Change Design; regression context; delivery work | The Specification is separate corrective work; it does not replace or retitle its provenance-bearing Defect reports |

Use headings, labels, and links to distinguish constituents. An adaptable
work-item composition is:

```markdown
## Change Specification | Bugfix Specification

### Context and scope
### Applicable and candidate Requirements
### Affected Architecture and decisions
### Change Design
### Verification context
### Delivery work
### Open questions and authority
```

Omit unsupported sections. A Change Specification remains its change case
record; a Bugfix Specification remains separate from every linked Defect
Report. The Change Design remains the bounded technical response, and each
linked canonical Requirement or Architecture concept remains authoritative in
its established home. A Specification may instead be conversational or span a
linked set; the name does not require a new document or directory.

## Keep artifact class and maturity separate

These dimensions can vary independently:

| Dimension | Examples |
| --- | --- |
| Artifact class | Defect Report, Change Specification, Bugfix Specification, Operational Incident Record, delivery item |
| Investigation | Unexplored, suspected, reproduced, root cause established |
| Design | None, options, proposed, accepted, superseded |
| Delivery | Unplanned, sequenced, approved, decomposed |
| Verification | Conditions known, strategy proposed, evidence gathered |
| Container | One issue, linked design document, decision record, parent and child items |

A Defect Report can therefore retain attributed investigation findings and
link a proposed design without becoming corrective work. When investigation
identifies a Bug and a correction is authorized, the accepted Change Design
and delivery plan belong in a separate linked Bugfix Specification. A proposed
Change Specification can retain detailed source material without treating it
as an accepted Requirement, Architecture change, or delivery authorization.

## 1. Inventory the source before compressing it

Identify every material item already present:

- observations, reproduction evidence, findings, and root-cause claims;
- functional and quality constraints or invariants;
- considered options, tradeoffs, recommendations, and decisions;
- responsibility, dependency, data-flow, and error-flow sketches;
- interfaces, pseudocode, code sketches, and prototypes;
- implementation order, ownership boundaries, and migration steps;
- behavioral verification conditions and testing strategy; and
- risks, unresolved questions, and explicitly excluded work.

Design-doc and RFC practices preserve this combination of context, goals,
design, alternatives, tradeoffs, examples, and open questions because the
reasoning is part of what later readers need.[^google-design-docs][^mozilla-rfc-template]

## 2. Preserve provenance and authority state

Apply the shared evidence guide. For technical context, also distinguish:

- **observed**, **confirmed**, or **hypothesized** for investigation;
- **constraint** or **assumption** for design inputs;
- **option**, **recommended**, **proposed**, **accepted**, **rejected**, or
  **superseded** for design choices; and
- **illustrative** or **contractual** for code and interface sketches.

Keep rejected options when their tradeoffs explain the chosen direction. Keep
open questions open. An author may normalize wording and structure, but must
not silently strengthen a proposal into a decision or a recommendation into
authorization.

## 3. Choose a proportional home

| Place | Use when | Work item retains |
| --- | --- | --- |
| Same work item | Context is bounded, stable enough, serves that artifact's authority, and does not cross the Defect Report/Bugfix boundary | The material itself |
| Linked design or RFC | Detail is lengthy, evolving, cross-cutting, or needs independent review | A decision-status synopsis and authoritative link |
| Architecture decision record | An accepted, durable architectural choice and consequences need their own lifecycle | The relevant decision and ADR link |
| Parent and child work items | An accepted workstream has been deliberately decomposed for delivery | Shared context, approved boundaries, and child links |

Decision records are appropriate for durable accepted choices because they
preserve context, decision, and consequences under an explicit lifecycle.[^aws-adr]
Do not create child implementation tasks merely because a supplied plan could
be decomposed; decomposition still requires delivery authority.

A dedicated Change Design is exceptional. Use one only under an established
repository convention for its location, owner, review, maintenance, and
supersession; otherwise keep the response in the conversation or work item.

## 4. Structure the retained context for retrieval

Use only the headings the source material can support. A useful optional block
is:

```markdown
## Technical design and delivery context

### Findings and constraints
### Decision status and tradeoffs
### Architecture and code sketches
### Proposed or accepted implementation sequence
### Testing strategy
### Risks and open questions
```

Keep diagrams, pseudocode, interface shapes, and code sketches when they carry
responsibility boundaries, translation rules, invariants, or sequencing that
prose alone would lose. Mark whether they are illustrative or accepted and
preserve enough surrounding explanation to prevent copy-paste implementation
from being mistaken for the contract.

## 5. Separate verification conditions from testing strategy

**Verification conditions** state the observable behavior or outcome that
would prove the work item resolved. **Testing strategy** states how evidence
will be gathered: test layers, adapter and integration boundaries, fixtures,
negative cases, regressions, environments, or manual checks.

Keep both when both already exist. Do not turn a proposed test file list into
acceptance criteria, and do not reduce a multi-layer strategy to “add tests.”
Mature proposal templates keep test planning distinct from goals, design,
risks, alternatives, and unresolved questions.[^kubernetes-kep-template]

## 6. Check for loss before publishing

Compare the final item with the source, especially when asked to “capture all
this.” Every material finding, constraint, status, sketch, plan step, testing
layer, tradeoff, and open question should either appear or have an
authoritative link and synopsis. Brief title and summary limits never justify
discarding body context.

## Representative cases

| Source material | Correct treatment |
| --- | --- |
| Bare defect evidence with no design | Write the defect report; do not invent design sections or placeholders |
| Defect report plus supplied architecture and code sketches | Preserve an attributed synopsis or link on the report; place accepted corrective design in a separate Bugfix Specification |
| Bounded proposed system change with supplied design | Preserve it in a Change Specification with proposal and authority state explicit |
| Several options with a recommendation but no decision | Retain options and tradeoffs; label the recommendation as proposed |
| Accepted corrective plan and testing strategy | Retain them in the separate Bugfix Specification and link its Defect reports without collapsing strategy into verification conditions |
| Cross-cutting design in an authoritative document | Keep a concise status synopsis and link rather than copying a divergent second source |
| “Capture all this” | Perform a lossless transfer of material context, not a template-shaped summary |

## Final check

- The artifact still represents the correct lifecycle and primary meaning.
- A Defect report remains the provenance-bearing case record and was not
  retitled or used as the accepted Bugfix Specification.
- Supplied technical context is present or linked; absent context was not invented.
- Facts, hypotheses, constraints, proposals, decisions, and open questions remain distinct.
- Architecture and code sketches retain their purpose and authority state.
- Implementation sequence is not mistaken for implementation authorization.
- Verification conditions and testing strategy remain separate.
- The brief is concise without imposing a length limit on the body.

[^aws-adr]: AWS Prescriptive Guidance, “ADR process.”
[^change-design]: [Change Design](../design/change-design.md) defines the
    technical response, authority boundaries, and ordinary capture paths.
[^google-design-docs]: Google Software Engineering, “Design Docs.”
[^kubernetes-kep-template]: Kubernetes Enhancement Proposal template.
[^mozilla-rfc-template]: Mozilla RFC template.
