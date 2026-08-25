---
finding: pre-push-depends-on-generated-workspace-state
subject: axm-cli-interactions
status: promoted
decision: proposed
notes: [2026-08-23T031632Z-e1caa7, 2026-08-24T191742Z-v2n6]
date: 2026-08-24
---

**Pattern:** A clean checkout or fresh worktree fails the repository pre-push
gate because `axm lint --strict` requires generated or ignored instruction
projections that checkout does not establish.
**Contributing factors:** `docs/CLAUDE.md` is gitignored and generated; the
AXM-owned Knowledge region of `AGENTS.md` is derived from installed workspace
extensions; the pre-push hook validates the whole workspace via
`./scripts/axm-local lint --strict`; neither checkout nor dependency
installation establishes the projections.
**Cause:** unknown — needs investigation (the setup/ownership boundary for
generated ignored projections is not established).
**Cause confidence:** plausible
**Actual impact:** Two rejected first pushes plus projection-repair work: one
occurrence needed a previewed sync, an applied sync, and a commit amendment;
the other a projection-only `axm lint --fix` repair.
**Cost evidence:** Repair command sequences recorded in both notes; elapsed
time not measured in either occurrence.
**Recurrence:** 2 independent occurrences / exposure unknown
**Extent:** The repository pre-push gate on clean `main` checkouts and fresh
worktrees that use the repository push hooks.
**Urgency:** none known
**Potential consequence:** not assessed
**Detectability:** obvious
**Recoverability:** simple workaround
**Evidence confidence:** corroborated
**Change:** Establish and document the setup/ownership boundary so one
explicit bootstrap makes a fresh worktree pushable — what owns generating the
ignored projections, or whether pre-push should validate reproducible
source/index state independently of them, is the investigation's outcome.
**Change cost:** unknown
**Proposed action type:** investigate
**Priority basis:** The failure sits on the default first-push path of every
clean checkout, recurred across independent sessions with corroborating
command output, and is obvious and simply recoverable — recurring friction
whose owning boundary is unknown, so investigation precedes any fix.
**Verify by:** A documented fresh-worktree bootstrap works on Linux and macOS,
runs `./scripts/axm-local`, and passes pre-push without hidden ignored-state
prerequisites.
**Adverse effects to check:** Strict lint must not be weakened; authored
content must not be changed unexpectedly by the bootstrap.
