# AXM architecture decisions

Accepted AXM Architecture Decision Records with durable consequences and
reconsideration conditions. The
[AXM architecture decision policy](../../decisions.md) owns the threshold,
authority, and content rules for these records.

- [Dual TypeScript alias toolchain](typescript-dual-alias.md) - The accepted
  decision to type check on the native TypeScript 7 compiler while
  `typescript` resolves to the TypeScript 6 compatibility package, exiting at
  TypeScript 7.1.
- [Project workspace settings validity prerequisite](project-workspace-settings-validity-prerequisite.md) -
  The accepted decision that project workspace construction fails before
  operation execution when either present settings source is invalid.
