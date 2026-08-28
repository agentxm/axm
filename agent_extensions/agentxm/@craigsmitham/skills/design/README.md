# Design

Develops the proportional technical response for one bounded change. It makes
responsibilities, interactions, state, failures, quality concerns, alternatives,
tradeoffs, migration, rollout, recovery, and unresolved decisions inspectable
without taking over Requirement or Architecture authority. It maps accepted
Architecture to technical realization and designs how every required
Requirement-satisfaction and Architecture-realization Evaluation Protocol is
implemented.

It can answer a sufficiently bounded Pitch, treating its rough response
contours as hypotheses rather than selected Design. It supports pitch-first,
specification-first, and design-first entry, but converges with
`spec` before the change is implementation-ready. Install it through
`@craigsmitham/packs/gen-stack`; it is not standalone.

Implementation-conformance Evaluations are an optional, explicitly separate
Design concern. If a local check reveals a durable or release-critical
semantic obligation, the claim returns to Spec as Requirement or Architecture
meaning before Design proceeds.

## License

MIT
