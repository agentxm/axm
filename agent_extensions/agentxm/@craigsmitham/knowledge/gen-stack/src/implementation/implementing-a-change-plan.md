---
type: Guide
title: Implementing a change plan
description: Use when an exact persisted Ready plan and separate mutation authority exist; accept the plan, realize the exact change, use Evaluation and focused reviewer feedback, preserve evidence, and return upstream when implementation exposes unresolved meaning.
tags: [implementation, change-plan, code-change, verification, focused-review, deviation, provenance, recovery]
status: draft
sources:
  - id: planning-guide
    resource: planning-change-implementation.md
    title: Planning change implementation
  - id: bounded-regeneration
    resource: bounded-regeneration.md
    title: Bounded regeneration
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T21:55:00Z
---

# Implementing a change plan

> **Authority:** Implementation owns current realized state. It does not accept
> Requirements, approve Architecture, change a selected Design, close work
> items, or authorize shipping merely by realizing a plan.

Use this Guide after applying [Running a change-realization
stage](../processes/running-change-realization-stages.md).

## Goal

Produce one candidate Implementation revision that realizes the authorized plan
within accepted meaning, uses planned focused review to course-correct stable
increments, preserves material provenance, and includes the evidence needed for
a fresh integrated final review.

## Implement

1. **Bind exact inputs and authority.** Resolve the exact persisted Ready plan,
   Accepted Change Specification and Change Design revisions, current
   repository state, authorized mutation boundary, and permitted tools, code
   execution, network, credentials, and external effects. Verify readback,
   empty Open items, and current bindings, then accept the plan in place before
   mutation. Plan acceptance and mutation authority remain separate. Preserve
   unrelated worktree changes.
2. **Reconfirm the first safe step.** Check that the plan still matches the
   realized state. If intervening changes invalidate dependencies or safety,
   revise the plan before mutation.
3. **Apply bounded changes.** Implement in coherent increments that preserve
   invariants and compatibility. Use existing repository patterns and tools
   when they remain consistent with accepted meaning. Do not broaden the change
   to opportunistic cleanup.
4. **Use evidence continuously.** Follow the plan's required
   Requirement-satisfaction and Architecture-realization Protocol feedback
   loops: establish their executable machinery at the planned seams, execute
   each at its earliest credible point, and re-execute it after the increments
   or triggers the plan identifies. Use bounded Results to guide, stop, or
   return realization upstream; do not defer useful Protocol execution merely
   because a final exit Execution is also required. Run proportionate
   Implementation-conformance checks and other static checks, tests, builds,
   inspections, migrations, or controlled scenarios where they distinguish
   correct from incorrect work. Preserve absent, pending, inconclusive,
   skipped, stale, and harness-error evidence, and record exact revisions,
   inputs, environments, outcomes, and limitations.
5. **Use focused review feedback.** At each planned checkpoint, bind an exact
   immutable subject and delegate one fresh, read-only reviewer assignment with
   the planned Architecture, Requirements, Evaluations, or Implementation
   focus. Supply exact authorities, evidence, scope, and read authority. The
   reviewer may report a material cross-domain finding but never edits the
   candidate. If fresh delegation is unavailable, follow only a plan-authorized
   fallback and label the result non-independent.
6. **Disposition review actions.** Record every required action as:

   - `resolved` — the candidate changed and resolution evidence is identified;
   - `returned-upstream` — the finding requires Specification, Architecture,
     Design, or planning authority;
   - `evidence-needed` — investigation or Evaluation is required;
   - `disputed` — contrary evidence is preserved and the finding remains
     visible; or
   - `no-longer-applicable` — later exact evidence makes the requested action
     irrelevant without erasing its history.

   Record the response, resulting revision or route, and evidence. Material
   change makes affected review claims stale and triggers re-review. Do not
   silently drop a finding or let the implementer self-certify it closed.
7. **Handle discoveries by owner.** A local reversible choice within accepted
   boundaries may be resolved and recorded. A changed outcome, obligation,
   subject, durable boundary, architecture-significant tradeoff, or selected
   response returns to specification or design. A diagnostic uncertainty may
   route to research or investigation.
8. **Record material deviations.** Identify where the candidate differs from
   the plan or Design, why, the evidence that forced the difference, and
   whether the owner accepted, rejected, or has not decided it. Do not rewrite
   the earlier artifact to conceal the divergence.
9. **Prepare final review evidence.** Execute the required final Protocols against
   the exact candidate revision or declared observation window when their
   preconditions exist. Identify the candidate revision, changed Implementation
   Units, realized authorities, performed incremental and final Executions,
   absent or failed evidence, focused review identities and action
   dispositions, residual risks, recovery state, and corpus disposition. Hand
   that exact candidate to a fresh integrated reviewer. A Result or checkpoint
   review remains bounded evidence, not an implementation-owned satisfaction,
   realization, or release decision.

## Candidate outcome

The implementation stage completes when the candidate is identifiable, the
authorized scope is realized or its partial state is explicit, performed
verification is attributable, deviations are reconciled or blocking, and a
fresh reviewer can assess the exact revision without reconstructing hidden
decisions or undispositioned checkpoint findings.

Implementation completion does not establish Requirement satisfaction,
Architecture realization, verified closure, or release readiness by itself.

## Failure and recovery

Stop before repeating a mutating or destructive action whose previous outcome
is unknown. Report partial state, data or schema effects, active compatibility
windows, running resources, rollback actually performed, and the next safe
action. Never infer reversal from a failed command or cancellation.

## Final check

- The candidate is bound to exact accepted inputs and current revision.
- Unrelated user work is preserved.
- Performed and planned verification remain distinct.
- Checkpoint reviews bind exact subjects, remain read-only, and have explicit
  action dispositions and re-review state.
- Material deviation and newly discovered meaning are visible.
- No implementation result was promoted into semantic or release authority.
