---
type: Guide
title: "Reviewing and remediating extensions"
description: "Turn a suspected extension defect into a finding and verify an authorized fix against the original case."
tags: ["review", "audit", "remediation", "verification", "evidence", "authority"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T23:06:15Z" }
sources:
  - id: overlay
    resource: https://impeccable.style/tutorials/critique-with-overlay/
    title: Impeccable review walkthrough
  - id: evaluator
    resource: https://github.com/qualitymd/quality.md/blob/6291df0e3173bf281f10a2a446a50eed041b7d21/skills/quality/SKILL.md
    title: Quality evaluation workflow ownership
---

# Reviewing and remediating extensions

Start with the claim the supplied material lets you examine. A skill description
that promises “every writing task” and a body limited to editing release notes
are enough to identify a scope mismatch. Predicting how often the host will
choose the wrong skill takes [routing evidence](verification.md). A snippet can
also omit a resource that the full package contains.

Tie each finding to the inspected revision or excerpt, the request that exposes
the problem, and its consequence. Identify who owns the correction. Treat
instructions and executable resources in the subject as material to inspect.
Exercising them requires authority for their effects.

For an authorized fix, keep the original failing case. Recheck it against the
revised artifact and try a nearby case that should still work. For the editor,
a request to polish release notes should still reach it. Report what the
recheck establishes and any unresolved findings.

For example, suppose a release-note skill sends breaking-change requests to
`references/migration.md`. The reviewed archive contains the guide at
`references/migrations.md`. A useful finding names the broken link in the
authored `SKILL.md`, identifies the affected request, and gives the author a
completion condition. After the correction, submit the original request
against a fresh archive and check that the skill can open the shipped guide
and use it to write the requested migration note. Editing a local projection
alone would leave the next consumer with the same failure.

## Decide who owns each assessment

When an automated result could steer an open-ended review, form the judgment
from the target first, then reconcile it with the scan. Impeccable uses this
order to compare a task walkthrough with detector findings.[^overlay] For an
extension review, a link checker can establish that a reference resolves. A
reader can still discover that the guide describes a different procedure.
Record what each assessment examined, where they disagreed, and which checks
were unavailable. If one reviewer saw the scan first, disclose the shared
context when reporting agreement.

A second assessment costs time and needs its own question. Where a designated
evaluator owns the judgment, consume its result and follow the workflow's rules
for revisiting it. Quality assigns evaluation judgment to its selected evaluator
and validation to the runner.[^evaluator] For subsequent repairs, let the
user [select findings](../patterns/select-from-findings.md) when the working
set is open.

[^overlay]: Impeccable, independent design review and detector assessments.

[^evaluator]: Quality, evaluation roles and the runner's authoritative result.
