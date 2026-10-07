# Behavioral evaluation cases

Run each case in a fresh context. Do not expose expected outputs or assertions
to the trial agent. `evals.json` is the machine-readable authority.

Cases 1–7 exercise activated execution: evidence-preserving Defect Reports,
separate Bugfix Changes, repository-specific content overlays, read-only host
mapping, process-agnostic Changes, current-state-first incidents, and partial
batch triage.

Cases 8–12 exercise routing: positive Defect Report and title-summary requests,
implementation and backlog negatives, and a vague cleanup request that requires
clarification or abstention.

The initial suite passes only when all critical gates and material assertions
pass in the declared environment. Authoring smoke is development evidence, not
independent evaluation or release approval.
