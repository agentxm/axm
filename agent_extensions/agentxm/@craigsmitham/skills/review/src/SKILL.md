---
name: review
description: Performs a read-only focused checkpoint review or an independent integrated review of one exact candidate against its Change, exact Change Specification and Change Design revisions, plan, accepted Requirements and Architecture, Evaluation evidence, operational conditions, and corpus coherence. Use for architecture, requirements, evaluation, implementation, code, or release-readiness review. Not for silently fixing the candidate, collapsing distinct assurance claims, accepting desired state, or authorizing merge, deployment, publication, or release.
---

# Review

Assess one exact immutable subject, lead with evidence-backed findings and
actions, and recommend the next route without changing the subject or claiming
release authority.

This skill belongs to the Gen Stack pack. Resolve knowledge through active AXM
scope; in this source workspace read:

- `knowledge/gen-stack/src/processes/running-change-realization-stages.md`;
- `knowledge/gen-stack/src/evaluations/reviewing-candidate-implementations.md`;
  and
- repository-local review instructions and applicable technical guidance.

## Boundary

Bind `checkpoint` or `final` mode, the focus, exact candidate revision or diff,
coherent Change, exact Change Specification and Change Design revisions, plan,
accepted Requirements and Architecture, applicable Protocols, performed
Executions and Results, scope, and review authority. Refuse a moving or
ambiguous subject. Checkpoint mode uses one of `architecture`, `requirements`,
`evaluations`, or `implementation`; final mode uses `integrated`.

Review is read-only by default. If the user also asks for fixes, complete and
identify the review first, then route changes through `implement` and review the
new revision. Review findings and a readiness recommendation do not confer
semantic acceptance or release authority.

A checkpoint review supplies course-correction feedback for one stable
increment. It never establishes release readiness. A final review independently
assesses the exact completed candidate across all assurance areas. When a
fresh-context reviewer performed earlier checkpoints, final review still uses a
fresh invocation and inspects primary evidence before relying on those results.

## Review

1. Inspect the candidate and material primary evidence independently before
   relying on the implementer's conclusion.
2. Read `references/review-result.md`, then load only the assigned focused
   lens for checkpoint mode. For final mode read all four lenses and
   `references/whole-change-review.md`:
   - `references/architecture-review.md`;
   - `references/requirement-review.md`;
   - `references/evaluation-review.md`; and
   - `references/implementation-review.md`.
3. Assess Requirement satisfaction, Architecture realization, semantic
   Evaluation quality, and Implementation quality as independent claims.
   Apply whole-change integrity as an integrated overlay, including Design
   conformance, operations, scope, corpus, provenance, and emergent definition
   gaps. A focused review may report a material cross-domain finding.
4. Run only authorized read-only or safely bounded checks. Preserve failed,
   skipped, stale, unavailable, `unknown`, and harness-error evidence.
5. For each supported finding, assign a stable ID and state severity, affected
   authority or candidate revision and location, expectation or risk, evidence
   and confidence, consequence, required outcome, and responsible route. Do
   not elevate style preference into correctness.
6. Return the compact result from `references/review-result.md`: decision,
   ordered required actions, supported findings, assurance summary, material
   unknowns, and review boundary. Keep successful checklist detail out of the
   result while visibly dispositioning every material claim.

For checkpoint mode use one disposition: `continue`,
`implementation-revision-required`, `definition-reconciliation-required`,
`more-evidence-required`, or `unable-to-assess`. For final mode use one
recommendation: `ready-for-release-decision`,
`implementation-revision-required`, `definition-reconciliation-required`,
`more-evidence-required`, or `unable-to-assess`. If no finding is supported,
state that for the inspected scope without claiming universal correctness.

Route candidate changes back to `implement`, meaning changes to `spec` or
`design`, and evidence gaps to `research` or `investigate`. Only a separately
authorized release decision is eligible for `ship`.
