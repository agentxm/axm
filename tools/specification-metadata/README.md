# @agentxm/specification-metadata

The executable-specification metadata contract that AXM repositories share:
`defineSpecification`, `defineProductGoals`, `defineExecutionBinding`, and
`defineBoundEvidence` with their vocabularies (classes, roles, boundaries,
methods, quality characteristics), the schema decoders that tooling uses to
read authored metadata, the corpus conformance check, and the shared product
goal registry. Root export only.

This is engineering support, not runtime code: it ships in the AXM release
cohort so consumer repositories can author specifications against the same
contract, but no runtime package may depend on it (ESLint keeps `role:tooling`
out of every runtime role). Dependency budget: `effect` only. It keeps a local
copy of the schema-issue formatter rather than depending on the extension
model, because specifications inside the extension model import this package
and a model dependency would make the two builds circular.

FSL-1.1-MIT © 2025-2026 AgentXM, Inc.
