---
type: Decision
status: stable
description: CLI vocabulary follows input roles and state ownership, while shared metadata and schemas keep human help and machine contracts coherent.
depends-on:
  - ../commands/overview.md
  - ../commands/help.md
  - ../commands/output.md
  - ./agent-targeting-is-workspace-membership.md
  - ./executable-specifications-authority.md
---

# CLI vocabulary and machine contracts

## Context

The CLI serves people reading terminal help and agents composing commands and
parsing results. Similar operations had accumulated different spellings,
parameter facts, and representations. Some differences reflected distinct
responsibilities; others made users discover incidental implementation choices.
Before launch, correcting those inconsistencies is preferable to preserving
multiple ways to express the same intent.

## Decision

Use shared vocabulary for the same role and retain distinctions that identify
different state owners. A subject or destination is positional; filters and
operation controls are flags. Root commands handle cross-type work, and type
groups supply type-specific capabilities. The
[command architecture](../commands/overview.md) owns the responsibility model;
[agent targeting](agent-targeting-is-workspace-membership.md) explains membership,
inspection, rendering, and import roles.

Keep authored claims separate from generated parameter facts. The registered
Effect command tree and shared parameter metadata supply human help, machine
help, and the generated reference. Requiredness, choices, defaults, bounds,
and repetition describe the input the parser actually accepts. Contextual
help links can explain the current command while pointing to one canonical
topic. [Help architecture](../commands/help.md) owns that structure.

Machine consumers use published schema families rather than terminal wording or
internal representations. The [output architecture](../commands/output.md#launch-contract)
owns the launch freeze, family versioning, and diagnostic exclusion. Shared
inventory facts and error vocabulary retain their identity across routes;
internal diagnostic contents remain support artifacts.

## Deliberate distinctions

Consistency does not make every similarly named operation interchangeable.
Installed inspection and published metadata lookup read different authorities.
Creation, adoption, import, fork, and demotion express different ownership
transitions. Extension update and CLI upgrade operate on different objects.
Scope and agent inputs remain local to commands where they have a supported
meaning. Error codes retain the Registry's snake_case vocabulary, and kernel
progress events retain their tagged event representation. Their canonical
owners explain the individual contracts; this record explains why these
exceptions remain coherent.

## Alternatives

Making every role a global flag would admit inputs on commands that cannot use
them. Renaming every operation to a smaller verb set would hide differences in
state authority. Keeping aliases would preserve ambiguous behavior and enlarge
the pre-launch surface. Freezing internal diagnostic fields would couple
consumers to implementation details without improving automation.

## Consequences and reconsideration

Contract changes update producers, consumers, fixtures, guidance, and generated
artifacts together. Removing an old spelling includes its recovery suggestions
and examples. Executable specifications in the
[specification catalog](../../../specifications/catalog.md), including
`cli/parameters/roles-match-supported-inputs`,
`cli/help/parameter-grammar-is-explicit`, and
`cli/publication-uses-explicit-registry-target`, own enforceable behavior.

Reconsider a deliberate distinction when the underlying state ownership or
supported input role changes. Reconsider the launch freeze at public launch;
a CLI version bump alone does not change a machine-contract family.
