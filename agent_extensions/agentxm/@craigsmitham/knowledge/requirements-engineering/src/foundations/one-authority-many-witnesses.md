---
type: Principle
title: One authority, many witnesses
description: Establishes one authoritative requirement identity with traceable representations and evidence elsewhere.
tags: [authority, traceability, witness, evidence, requirement-identity]
generated: { by: codex/gpt-5.6, at: 2026-08-29T20:06:39Z }
---

# One authority, many witnesses

Each normative requirement needs one declared authoritative identity and
source. Designs, code, configuration, tests, dashboards, evidence, and work
items may witness or reference it; they do not silently become competing
authorities.

Use directional relationships with explicit meanings, such as:

- `derived from` a source, rule, decision, or higher-level requirement;
- `refines`, `allocates`, or `constrains` another requirement;
- `realized by` a design element or implementation;
- `verified by` an assessment definition;
- `evidenced by` a revision-bound result;
- `changed by` a decision or work item;
- `supersedes` an earlier requirement identity.

Prefer native typed links when a host preserves these meanings. Otherwise use
stable identifiers and explicit labeled references. Duplicate requirement text
must identify its authority and synchronization policy; unlabeled copies invite
semantic drift.
