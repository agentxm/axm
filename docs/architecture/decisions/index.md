# AXM architecture decisions

Accepted decision records with durable consequences. Each record owns one
choice, its context, rationale, alternatives, consequences, and
reconsideration conditions. Enforceable consequences live as executable
specifications, never in these records.

- [Executable specifications own AXM requirements](executable-specifications-authority.md) —
  executable specifications under `specifications/` are the sole local
  authority for accepted AXM requirements; documentation retains explanation
  without owning obligations
- [Specification infrastructure decisions](specification-infrastructure.md) —
  the resolved design decisions behind the specification infrastructure:
  identity, metadata carrier, project ownership, adapters, budget, selection,
  and governance controls
- [Dual TypeScript alias toolchain](typescript-dual-alias.md) — type check on
  the native TypeScript 7 compiler while `typescript` resolves to the
  TypeScript 6 compatibility package, exiting at TypeScript 7.1
- [Project workspace settings validity prerequisite](project-workspace-settings-validity-prerequisite.md) —
  project workspace construction fails before operation execution when either
  present settings source is invalid
- [Official AXM skill is opt-in](official-axm-skill-is-opt-in.md) — workspaces
  declare the official skill directly or through a Pack before compatibility
  applies; undeclared absence remains informational
- [CLI output view model and terminal ownership](cli-output-view-model-and-terminal-ownership.md) —
  human output crosses the application boundary as a typed document painted by
  one terminal owner while machine output remains schema-backed
- [MCP local names are connection identity, not source identity](mcp-local-connection-identity.md) —
  MCP local names identify connections and native projections, while source
  authority and published package identity define shared resolution.
