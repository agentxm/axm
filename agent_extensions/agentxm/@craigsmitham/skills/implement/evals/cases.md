# Behavioral evaluation cases

The machine-readable authority is `evals.json`. Run each case in a fresh,
disposable context with the Gen Stack knowledge support path. The suite covers
explicit selection, implicit abstention, stage-specific happy and boundary
execution, read-only focused reviewer delegation, action disposition, stale
claim re-review, unavailable-freshness fallback, and forbidden side effects.
Missing side-effect evidence is `unknown`, never an inferred pass.

Suite 2.0.0 adds the shared forward handoff: `$implement` accepts only the
exact persisted Ready plan before mutation, while plan acceptance and
repository mutation authority remain independent preconditions. Candidate
closeout uses the shared four-line recovery handoff.
