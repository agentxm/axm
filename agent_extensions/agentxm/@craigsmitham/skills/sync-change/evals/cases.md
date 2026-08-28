# Sync Change evaluation cases

The versioned suite covers routing and activated execution separately.

- Exact landed artifact persistence selects Sync Change rather than rerunning
  Spec, Design, Plan, or Ship.
- New semantic authoring and final release actions abstain because their owning
  stages require explicit selection.
- Stage completion without persistence intent and rough notes without an exact
  landed artifact do not activate synchronization.
- Complete sources remain required; summaries and handoffs are insufficient.
- Native host contracts are inspected without importing vendor-specific fields,
  labels, workflows, or hierarchy into portable behavior.
- Canonical ownership, shared artifact state, mutation scope, concurrency,
  idempotency, readback, and the `VERIFIED-EXACT`, `VERIFIED-FAITHFUL`, `DRIFT`,
  and `UNVERIFIED` fidelity results remain explicit.
- Inadequate hosts retain linked synopses rather than lossy complete copies.
- Ready and Accepted revisions update one canonical artifact in place.
- Derived implementation-record projection is outside Sync Change.
- When compaction loses chat-only edits, the last persisted Draft is reported
  honestly and exact missing content is returned to the user.

All examples and fixtures are synthetic and public-safe. Routine generated runs
belong under ignored `.work/evals/`, not in this package.

Suite 2.0.0 also preserves the shared first-screen artifact presentation and
structured Open items across host-native representation normalization.
