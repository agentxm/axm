---
type: Reference
title: Minimal conforming architecture corpus
description: A complete synthetic OKF corpus and dated manual report demonstrating the smallest nontrivial adoption of the software architecture docs profile.
tags: [architecture-documentation, okf, application-profile, conformance, reference-corpus]
status: draft
sources:
  - id: software-architecture-docs-profile
    resource: software-architecture-application-profile.md
    title: Software architecture docs application profile for OKF v0.2
  - id: just-enough-architecture-docs
    resource: just-enough-architecture-docs.md
    title: Just Enough Architecture Docs
generated:
  by: codex/gpt-5.6
  at: 2026-08-25T19:19:59Z
---

# Minimal conforming architecture corpus

This reference gives profile authors and validators one complete, inspectable
example rather than isolated fragments. It applies version 0.10.2 of the
software architecture docs profile[^software-architecture-docs-profile] and
keeps only meaning that passes the Just Enough Architecture Docs admission
test.[^just-enough-architecture-docs]

The subject is synthetic. It contains the five required root concepts, one
system-wide functional Requirement, one use case, and three C4 elements: enough
to exercise the mandatory kernel, requirement colocation, behavioral identity,
navigation, and both C4 containment rules. The decision policy justifies why no
local ADR is maintained.

“Complete” describes the fixture as an inspectable profile example, not its
requirements as a complete specification of the synthetic system. The one
Requirement is a selected architecture-significant obligation; the fixture
makes no bounded requirement-set completeness claim.

## Corpus tree

```text
index.md
system.md
lifecycle.md
ownership.md
decisions.md
assurance.md
system/
├── index.md
└── requirements/
    ├── index.md
    └── functional/
        ├── index.md
        └── rejected-confirmation-preserves-capacity.md
use-cases/
├── index.md
└── confirm-reservation.md
structure/
├── index.md
├── systems/
│   ├── index.md
│   └── reservation-platform.md
└── containers/
    ├── index.md
    ├── reservation-service.md
    └── reservation-service/
        ├── index.md
        └── components/
            ├── index.md
            └── reservation-application.md
```

## Files

The complete fixture is stored at the extension-relative path
`examples/minimal-conforming/`. Its root index links every concept, and the
fixture can be copied or validated independently without extracting fenced
examples from this document.

## Manual conformance report

| Property | Result |
| --- | --- |
| Assessment date | 2026-08-25 (America/Chicago) |
| Assessor | `codex/gpt-5.6` |
| Assessment kind | Author self-assessment; not independent verification |
| OKF v0.2 result | Conforms for the linked fixture files |
| Structural checker result | Passes `validate-software-architecture-profile.py` for version 0.10.2 |
| Profile result | Conforms to applicable `software-architecture-docs` version 0.10.2 rules |

The assessment examined these rules manually:

- The root declares `okf_version: "0.2"` and explicitly names the adopted
  profile identity and version.
- Every non-reserved concept file has a path-derived identity and the required
  `type`, `title`, `description`, and `status`; reserved `index.md` files remain
  navigational.
- The root contains the required System, System Lifecycle, System Ownership,
  Architecture Decision Policy, and System Assurance concepts at their exact
  paths, and the root index links each one.
- The lifecycle states the support state, change horizon, expected evolution,
  and review triggers without overloading OKF `status`.
- Ownership identifies the stable maintenance, continuity, and escalation
  route without copying a volatile roster.
- The decision policy defines the ADR threshold, authority, minimum content,
  and reconsideration route, and justifies why no local ADR collection is
  currently required.
- Assurance defines the applicable evidence and review route, explicitly
  bounds its “no additional assurance” conclusion, and gives corpus-level
  reassessment triggers without inventing a System obligation.
- The Requirement has a unique stable identifier, valid functional type,
  explicit System subject, matching subject-colocated path, singular `shall`
  statement, rationale, and source link to the maintained Use Case.
- The functional type follows the accepted state-preservation behavior rather
  than the clause form, source heading, or comparison technique; no competing
  quality, process, human-factors, usability, or constraint meaning is primary.
- Individual manual review found the Requirement necessary relative to the
  use-case extension, appropriate to the System subject, unambiguous and
  complete for its synthetic condition and outcome, singular, feasible within
  the stated synthetic boundary, verifiable by comparing the capacity
  commitment before and after rejection, correct relative to its source, and
  conforming to the profile style. This is author self-assessment, not
  independent stakeholder validation or production feasibility evidence.
- The fixture presents a selected requirement and does not claim that its
  system requirements are complete, so the profile's bounded set-review rule
  is not applicable.
- Every concept is reachable from the root, and each present collection links
  its immediate concepts or narrower collection.
- The Use Case states its subject boundary, primary actor role, actor goal,
  successful outcome, goal scope, and main success scenario. Its material
  extension links the normative Requirement rather than restating its binding
  predicate.
- The C4 Software System states its boundary, responsibility, and material
  exclusions and links the required root context concepts rather than
  duplicating their meaning. It links the System requirements as the normative
  authority for accepted obligations.
- The C4 Container identifies exactly one containing C4 Software System and
  does not contain another container.
- The C4 Component's canonical path and body identify exactly one owning C4
  Container; it does not contain another component.
- Current interfaces, protocols, deployments, packages, and test details are
  left with executable authorities rather than copied into the corpus.
- No Architecture Decision Record or quality Requirement is present, so their
  conditional collection and quality-model classification rules do not apply.

This report is evidence that the written example was checked against the named
rules on the stated date. The structural result is executable authoring
evidence; the complete profile result remains a manual author self-assessment.
Neither is a human verification event, independent review, or reader test, and
the concept remains `draft`.

[^software-architecture-docs-profile]: The profile defines the concept types,
    paths, containment constraints, lifecycle context, and manual validation
    rules applied here.
[^just-enough-architecture-docs]: Just Enough Architecture Docs limits the
    corpus to accepted, durable meaning that executable and runtime authorities
    do not already reveal reliably enough.
