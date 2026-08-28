# Functional Requirements

Required behavior the AXM System preserves across workspace change,
reconciliation, and telemetry.

- [Content changes require established authority](content-changes-require-established-authority.md) -
  AXM changes workspace content only with established authority over the
  smallest independently changeable unit.
- [Workspace changes do not interleave](workspace-changes-do-not-interleave.md) -
  Two AXM changes to the same workspace scope never interleave.
- [Reconciliation preserves configuration](reconciliation-preserves-configuration.md) -
  Reconciliation of current workspace state with desired state never changes
  workspace configuration or advances a satisfying accepted resolution.
- [Lock state never creates reachability](lock-state-never-creates-reachability.md) -
  Authoritative lock state never makes an extension or workspace capability
  desired, reachable, or retained.
- [Telemetry failure never alters outcomes](telemetry-failure-never-alters-outcome.md) -
  Telemetry failure never alters a requested operation's output, state
  changes, or exit status.
