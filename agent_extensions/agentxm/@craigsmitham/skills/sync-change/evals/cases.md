# Sync Change evaluation cases

The versioned suite covers routing and activated execution separately.

- Exact landed artifact persistence selects Sync Change rather than rerunning
  Spec, Design, Plan, or Ship.
- New semantic authoring and final release actions route to their own skills.
- Complete sources remain required; summaries and handoffs are insufficient.
- Native host contracts are inspected without importing vendor-specific fields,
  labels, workflows, or hierarchy into portable behavior.
- Canonical ownership, artifact maturity, mutation scope, concurrency,
  idempotency, readback, and the four fidelity results remain explicit.
- Inadequate hosts retain linked synopses rather than lossy complete copies.
- Plan projection preserves exact artifact bindings, complete step context,
  dependency consistency, authority, per-item readback, and partial failure.

All examples and fixtures are synthetic and public-safe. Routine generated runs
belong under ignored `.work/evals/`, not in this package.
