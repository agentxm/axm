---
type: Reference
title: Provenance and supply chain
description: How source, integrity, dependencies, licensing, review, and rollback support trust.
tags: [agent-skills, provenance, integrity, dependencies, licensing]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:36:04Z }
stale_after: 2027-02-14
---

# Provenance and supply chain

Before trusting a skill, establish its canonical source, publisher, exact
version or digest, acquisition path, license, review history, and update policy.
Inventory every included file and transitive runtime dependency. A clean
`SKILL.md` does not make an opaque binary, fetched installer, or mutable remote
resource safe.

Prefer immutable versions, reproducible packaging, declared dependencies,
integrity verification, least-privilege scripts, and reviewable generated state.
Record who can publish, how an update is approved, and how consumers can pin,
revoke, or roll back a compromised release.

Missing provenance is evidence of uncertainty. Do not infer trust from a shared
repository, installed copy, familiar namespace, popularity, or a package
manager's successful resolution.

Licenses and attributions apply to instructions, code, examples, templates, and
other embedded assets. Synthetic examples reduce both disclosure and ownership
risk.

