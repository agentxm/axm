# Constraint Requirements

Binding limits on AXM's permitted dependency, information, telemetry, and
toolchain boundaries.

- [Public AXM remains independent of private implementation](public-private-boundary.md) -
  AXM depends on private AgentXM responsibilities only through public-safe
  contracts and packages.
- [Workspace configuration cannot enable telemetry](workspace-configuration-cannot-enable-telemetry.md) -
  No workspace configuration can opt a user into AXM telemetry collection.
- [DO_NOT_TRACK takes precedence](do-not-track-takes-precedence.md) -
  DO_NOT_TRACK disables AXM telemetry regardless of any AXM-specific selection
  or lower-precedence control.
- [Telemetry collection respects the data boundary](telemetry-collection-respects-data-boundary.md) -
  Telemetry payloads stay within the documented data boundary and never
  include extension content, authored instructions or Knowledge, credentials,
  secrets, or resolved secret values.
- [Dual TypeScript alias retained until exit](dual-typescript-alias-retained-until-exit.md) -
  The AXM repository toolchain keeps the dual TypeScript alias and is not
  collapsed to a single typescript dependency until the exit condition
  recorded in the TypeScript dual-alias decision is met.
