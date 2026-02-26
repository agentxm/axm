## Context

The repository has strong guidance (`AGENTS.md`, `CLAUDE.md`, `.claude/skills/`, `contributing/guides/`), but review execution is inconsistent across areas and contributors. This change defines a single sweep strategy for tasks to follow so findings are comparable, fixes are traceable, and review quality does not depend on reviewer preference.

Constraints:

- Align with `.claude/skills/code-review/SKILL.md` process and output style.
- Optimize for impact-first review (correctness and safety before conventions and style).
- Require lint to pass for any accepted fix.

## Goals / Non-Goals

**Goals:**

- Define a deterministic task-plan strategy for full-codebase review sweeps.
- Define evaluation criteria reviewers use to judge code quality and produce findings.
- Define remediation and verification gates so accepted findings are fixed with evidence.
- Require task-plan completion to remediate every in-scope finding.
- Make outputs auditable: each finding maps to a location, rationale, fix status, and validation step.

**Non-Goals:**

- Creating new product capabilities or user-facing CLI features.
- Redesigning project-wide coding conventions.
- Guaranteeing zero defects in one pass.

## Decisions

### 1) Sweep strategy is phased and coverage-driven

Task plans must execute review in fixed phases:

1. **Scope phase**: enumerate targets (staged, unstaged, high-risk modules, then full baseline).
2. **Guidance phase**: load relevant rules for each target (`CLAUDE.md`, co-located guidance, skills, guides).
3. **Review phase**: evaluate files against criteria and log findings + commendations.
4. **Remediation phase**: implement prioritized fixes in batches.
5. **Verification phase**: run required validation (`pnpm lint` always; plus targeted tests/typecheck as needed).
6. **Closure phase**: close only when all in-scope findings are fixed and verified.

Why: fixed phases prevent skipped guidance, reduce reviewer variance, and support repeatable quality checks.

Alternative considered: one-pass free-form review. Rejected because it is faster short-term but inconsistent and hard to audit.

### 2) Evaluation criteria use a weighted rubric

Every finding must be tagged to one rubric category with priority order:

1. **Correctness**: logic bugs, invalid state handling, schema/parse gaps, broken edge cases.
2. **Safety**: path safety, destructive behavior, secret handling, error propagation, unsafe defaults.
3. **Reliability**: typed errors, Effect usage patterns, resource cleanup, deterministic behavior.
4. **Conventions**: project structure, naming, command/handler boundaries, Option/Schema/service patterns.
5. **Test quality**: missing regression coverage, brittle assertions, non-deterministic tests.
6. **Style/readability**: clarity issues that materially affect maintenance.

Why: severity-first ordering aligns with the code-review skill guidance and focuses effort where failures are most costly.

Alternative considered: equal-weight checklist. Rejected because it obscures risk and creates low-value churn.

### 3) Finding quality bar is strict and actionable

A finding is valid only if it includes:

- exact location (`file:line`),
- violated rule/category,
- user impact,
- concrete fix recommendation,
- fix status (`open`, `in_progress`, `fixed`).

No-defer rule: for this change, deferred findings are not allowed at final closure.

Why: this keeps reports implementation-ready and prevents vague/nit-only feedback.

Alternative considered: narrative-only summary. Rejected because it cannot drive reliable remediation tracking.

### 4) Remediation follows risk-first batching

Task plans must fix findings in this order:

- batch A: correctness/safety,
- batch B: reliability/conventions,
- batch C: test/style improvements.

Each batch must end with verification before starting the next batch.

Why: avoids mixing critical and cosmetic work and makes partial progress safe to ship.

Alternative considered: file-by-file fixes in discovery order. Rejected because critical issues can remain open while low-risk work is completed.

## Risks / Trade-offs

- **[Longer review cycles]** More structure increases process time. → Mitigation: permit scoped sweeps per domain while keeping the same rubric and closure format.
- **[Over-reporting low-impact issues]** Large sweeps can produce noise. → Mitigation: enforce impact threshold and prioritize only actionable findings.
- **[Inconsistent criterion interpretation]** Different reviewers may classify issues differently. → Mitigation: require category + rationale in every finding and use examples in the task plan.
- **[Verification bottlenecks]** Full test runs can be expensive. → Mitigation: require `pnpm lint` always; add targeted tests/typecheck tied to changed areas.

## Migration Plan

1. Create the task artifact with explicit sweep phases and rubric mapping.
2. Run an initial pilot sweep on a bounded subset (one command family + shared utility).
3. Calibrate rubric wording from pilot outcomes.
4. Run full-codebase sweep using calibrated task plan.
5. Publish findings ledger and remediation status after each batch.
6. Close the change only after all findings are remediated and required verification passes.

Rollback: if sweep overhead is too high, revert to scoped sweeps per area but keep the same rubric and evidence requirements.

## Open Questions

- Should closure require `pnpm typecheck` in addition to `pnpm lint` for all remediation batches?
