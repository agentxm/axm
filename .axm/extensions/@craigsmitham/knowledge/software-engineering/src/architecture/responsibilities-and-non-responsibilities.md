---
type: Explanation
title: Responsibilities and non-responsibilities
description: How stating both what an element owns and what it excludes prevents overlapping authority and accidental coupling.
tags: [responsibilities, non-responsibilities, ownership, boundaries, separation-of-concerns]
status: draft
generated:
  by: codex/gpt-5
  at: 2026-08-15T15:20:54Z
---

# Responsibilities and non-responsibilities

A responsibility states the outcome or policy an architectural element owns.
A non-responsibility states what the element must leave to another owner. Both
are necessary to define a boundary.

Responsibilities should describe durable meaning rather than a list of current
functions. They answer:

- What outcome must this element preserve?
- Which decisions may it make?
- Which state or policy is it authoritative for?
- What must remain true at its boundary?

Non-responsibilities make “not my job” explicit. They prevent an element from
absorbing adjacent concerns merely because it can. When the proper owner is
known, name it; otherwise state the exclusion without inventing one.

An overlap is not automatically wrong, but overlapping authority is. Several
elements may participate in authentication, for example, while only one owns
credential verification and another owns access policy. Collaboration becomes
tractable once the decision rights are distinct.

Lists that only restate current methods or packages are implementation
inventories, not architectural responsibilities. A useful responsibility still
makes sense after functions move or technologies change.
