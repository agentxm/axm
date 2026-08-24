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
  at: 2026-08-22T00:17:07Z
---

# Minimal conforming architecture corpus

This reference gives profile authors and validators one complete, inspectable
example rather than isolated fragments. It applies version 0.7.0 of the
software architecture docs profile[^software-architecture-docs-profile] and
keeps only meaning that passes the Just Enough Architecture Docs admission
test.[^just-enough-architecture-docs]

The subject is synthetic. It contains one use case, one C4 Software System,
one C4 Container, and one C4 Component: enough to exercise behavioral identity,
navigation, and both C4 containment rules without adding speculative concept
types. Product Quality Requirements are deliberately absent, so the ISO/IEC
25010 classification rules do not apply to this corpus.

## Corpus tree

```text
index.md
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

| Property        | Result                                                                  |
| --------------- | ----------------------------------------------------------------------- |
| Assessment date | 2026-08-21 (America/Chicago)                                            |
| Assessor        | `codex/gpt-5.6`                                                         |
| Assessment kind | Author self-assessment; not independent verification                    |
| OKF v0.2 result | Conforms for the linked fixture files                                   |
| Profile result  | Conforms to applicable `software-architecture-docs` version 0.7.0 rules |

The assessment examined these rules manually:

- The root declares `okf_version: "0.2"` and explicitly names the adopted
  profile identity and version.
- Every non-reserved concept file has a path-derived identity and the required
  `type`, `title`, `description`, and `status`; reserved `index.md` files remain
  navigational.
- Every concept is reachable from the root, and each present collection links
  its immediate concepts or narrower collection.
- The Use Case states its subject boundary, primary actor role, actor goal,
  successful outcome, goal scope, and main success scenario.
- The C4 Software System states its boundary, responsibility, material
  exclusions, lifecycle, maintenance mechanism, decision-authority route, and
  architecture-documentation review triggers.
- The C4 Container identifies exactly one containing C4 Software System and
  does not contain another container.
- The C4 Component's canonical path and body identify exactly one owning C4
  Container; it does not contain another component.
- Current interfaces, protocols, deployments, packages, and test details are
  left with executable authorities rather than copied into the corpus.
- No other profiled concept type is present, so its type-specific rules are not
  applicable. In particular, no Product Quality Requirement is present; exact
  ISO/IEC 25010 classification and source-access rules are not applicable.

This report is evidence that the written example was checked against the named
rules on the stated date. It is not a human verification event, reader test,
or executable validator result, and the concept remains `draft`.

[^software-architecture-docs-profile]:
    The profile defines the concept types,
    paths, containment constraints, lifecycle context, and manual validation
    rules applied here.

[^just-enough-architecture-docs]:
    Just Enough Architecture Docs limits the
    corpus to accepted, durable meaning that executable and runtime authorities
    do not already reveal reliably enough.
