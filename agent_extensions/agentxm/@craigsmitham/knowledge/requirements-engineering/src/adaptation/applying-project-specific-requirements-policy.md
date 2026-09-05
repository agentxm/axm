---
type: Guide
title: Applying project-specific requirements policy
description: Layers local terminology, authority, content obligations, rigor, and lifecycle rules over the portable requirements model.
tags: [adaptation, policy, local-instructions, authority, rigor]
sources:
  - id: portable-model
    resource: ../foundations/portable-requirements-engineering.md
    title: Portable requirements engineering
generated: { by: codex/gpt-5.6, at: 2026-08-29T20:06:39Z }
---

# Applying project-specific requirements policy

Treat repository and organizational instructions as the authority for local
domain content and operating policy. Map them onto the portable model rather
than replacing semantics implicitly.[^portable-model]

Declare at least:

- project terminology and requirement classification;
- authoritative hosts, identifier rules, and duplicate-text policy;
- candidate and normative states, decision authorities, and approval evidence;
- required fields, source types, relationship types, and change history;
- review depth, assurance obligations, and domain-specific specialists;
- verification and validation expectations;
- confidentiality, regulatory, retention, and access constraints;
- lifecycle and integration rules for work items, designs, tests, and releases.

Apply the stricter applicable obligation when portable guidance and local policy
both govern quality. If they conflict on authority or meaning, surface the
conflict rather than silently choosing one. Project instructions may add
content requirements without forcing this bundle to prescribe a universal form.

[^portable-model]: This adaptation rule applies the cited portable model while
    leaving project-specific authority with the consuming project.
