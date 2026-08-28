# Behavioral evaluation cases

The machine-readable authority is `evals.json`. Run each case in a fresh,
disposable context with the Gen Stack knowledge support path. The suite covers
explicit selection, implicit abstention, stage-specific happy and boundary
execution, and forbidden side effects. Missing side-effect evidence is
`unknown`, never an inferred pass.

Suite 1.0.0 adds an authorized synthetic final-action case and binds output to
the exact decision-first Ship result: subject and outcome first, then separated
authority, observed effects, verification, recovery, risk, and observations.
