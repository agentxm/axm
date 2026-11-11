---
type: Pattern
title: Readiness checklist
description: When proceeding depends on known conditions, gather current evidence against explicit criteria and give an accountable role a clear proceed, hold, or escalate decision.
tags: [docs, documentation-pattern, checklist, readiness-gate, readiness, release, coordination, decision, authoring]
status: draft
sources:
- id: checklist-design-origin
  resource: https://github.com/craigsmitham/agent-extensions/blob/156c3d4346bee6874ab3d356c19446cf6425713b/skills/checklist-design/src/references/purpose-and-artifact-fit.md
  title: Craig Smitham — Purpose and artifact fit, version 0.1.10
- id: aapm-checklists
  resource: https://aapm.onlinelibrary.wiley.com/doi/10.1002/acm2.13895
  title: Conroy et al. — Development, implementation, use and maintenance of safety checklists
generated:
  by: codex/gpt-6
  at: '2026-11-11T17:40:43Z'
---

# Readiness checklist

When proceeding depends on known conditions, **gather current evidence against
explicit criteria and give an accountable role a clear proceed, hold, or
escalate decision**.

## Problem and design response

Several people may each have completed their work while no one knows whether
the next activity can begin. A readiness checklist brings relevant conditions
together at a decision point. Its output is a bounded disposition with evidence,
not a percentage of boxes checked.

An item may use do-confirm; a team pause may use challenge-response. AAPM
describes group checks at procedural pauses where responsible participants
verify their work.[^aapm-checklists] The broader decision framing here is this
collection's synthesis, not a universal classification from that source.

## How to write it

- Name the proposed transition, when the decision is needed, and its owner.
- Obtain criteria from the accountable domain authority. Distinguish conditions
  required to proceed from advisory observations; do not invent a pass score.
- For each condition, identify evidence, responsible role, acceptable state,
  and relevant freshness or version. Treat unknown and failed states explicitly.
- Define what produces a hold, who can resolve a discrepancy, and where an
  exception may be authorized. If exceptions are not permitted, say so.
- Record the decision and unresolved conditions. Name changes that invalidate
  it and require reassessment; a check is not permanent permission.
- Place the pause where evidence is available and action can still change.

Use [Verification checklist](verification-checklist.md) for the quality of
individual checks and [Checklist](checklist.md) for shared interaction and
validation guidance. The document can expose a decision; it cannot confer
authority on its author, operator, or approver.

## Applicability and tradeoffs

Use a readiness checklist when conditions and decision rights are sufficiently
known. If the team must discover what matters or diagnose an unfamiliar
situation, use a [playbook](playbook.md), investigation, or deliberation first.
Use a [runbook](runbook.md) for actions selected after the decision.

A visible pause can make disagreement and missing evidence actionable. It
also creates delay and coordination cost. Overuse creates approval bottlenecks;
weak criteria create false confidence. A gate that cannot be failed in practice
is unlikely to expose readiness problems. Consider hierarchy and incentives
that discourage participants from reporting an unmet condition.

## Illustrative realizations

A documentation release might wait for a current rendered preview, resolved
blocking review findings, and the named release owner's decision. A workshop
handoff might wait for the receiving facilitator to acknowledge materials and
unresolved participant needs. These illustrative instances differ in criteria
and consequence but share an explicit transition and decision owner.

A vague “Are we ready?” poll without evidence or decision rights does not
realize this pattern. Neither does counting completed tasks while ignoring a
single condition that prevents proceeding.

## Review and evidence

Evaluate false passes, unnecessary holds, decision agreement, escalation,
elapsed time, and outcomes after proceeding. Test missing evidence, conflicting
observations, late changes, and an unavailable owner. Compare with the actual
decision practice; a more elaborate gate is not automatically an improvement.

This draft develops the earlier readiness-gate guidance.[^checklist-design-origin]
Its examples and generalized formulation have not been independently evaluated.

[^checklist-design-origin]: Craig Smitham — Purpose and artifact fit, version 0.1.10.
[^aapm-checklists]: Conroy et al. — Development, implementation, use and maintenance of safety checklists.
