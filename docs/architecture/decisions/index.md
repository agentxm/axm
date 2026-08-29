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
