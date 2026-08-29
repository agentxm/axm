---
type: Architecture
status: stable
description: How AXM commands, workspace state, ownership, and verification fit together.
depends-on:
  - "@agentxm/knowledge/agentxm#domain/extension-model"
---

# AXM overview

This document describes AXM's purpose, boundary, exclusions, and environmental
relationships, and elaborates the detailed accepted architecture response. The
executable specifications in the
[specification catalog](../../specifications/catalog.md) own required
behavior; this corpus explains the design that satisfies them.

Shared product terms such as AgentXM, AXM, agent, extension, extension type,
extension version, registry, workspace, handle, owner, publisher, pack, and
library are defined by
`@agentxm/knowledge/agentxm#domain/extension-model`. This architecture corpus applies
that language to AXM; it does not redefine the shared product model.
[The glossary](glossary.md) defines recurring AXM-specific terms used across
the corpus.

AXM helps users find and manage reusable extensions, configure agent
capabilities across coding agents, and author and distribute extensions. A
user expresses durable choices through commands and workspace configuration.
AXM derives the complete desired workspace state and presents the selected
capabilities in the form and location each configured agent expects.

The architecture keeps user intent, workspace configuration, desired state,
authoritative external lock state, canonical extension content, inline
configuration, and managed output separate. That separation lets AXM reconcile
current state without silently changing what the user asked for.

## Responsibilities

AXM is responsible for:

- recording explicit workspace choices;
- deriving desired extensions, activation, agents, and workspace capabilities
  from those choices;
- resolving, obtaining, and retaining sourced extension content;
- maintaining explicitly configured inline capabilities;
- presenting managed capabilities to configured agents;
- validating and distributing workspace-authored extensions;
- diagnosing invariant violations; and
- safely reconciling managed current state with desired state.

## Non-responsibilities

AXM is not responsible for:

- defining shared AgentXM product language or extension standards;
- installing, running, or administering coding-agent products or extension
  runtimes;
- inferring choices the user has not expressed;
- adopting unowned native content or rewriting or deleting content without
  unit-local authority;
- treating existing files or lock entries as declarations of intent;
- making every invalid state automatically fixable; or
- providing a generic health, repair, or policy-enforcement system beyond its
  defined extension and agent-workspace responsibilities.

Workspace diagnosis, reconciliation, resolution, output, and caching support these
jobs; they are not additional reasons for AXM to become a generic workspace or
agent administration tool.

## System structure

- `@agentxm/client-core` owns reusable extension contracts, workspace state,
  planning, source and registry integration, and agent-independent operations.
- `axm.sh` owns command parsing, terminal interaction, rendering, and assembly
  of the executable runtime. It delegates reusable behavior to core.
- `@agentxm/client-utils` contains small public utilities without taking domain
  ownership from core.
- End-to-end projects verify the published CLI boundary and do not become
  production dependencies.

Production dependency direction points from the CLI toward core and utilities.
Core never depends on CLI interaction or output rendering.

AXM is the public side of the AgentXM system. It may depend on published
service contracts and published OSS-safe code packages. The executable
specification
`system/architecture/public-system-depends-only-on-published-contracts` in the
[specification catalog](../../specifications/catalog.md) owns that obligation.
Contracts shared with the private platform belong in the public shared kernel
only when both implementations must use identical meaning.

## The workspace model

```text
authoring intent -> workspace-authored canonical content ------------+
                                      ^                              |
                                      | selected by                  |
user intent -> workspace configuration -> desired workspace state    |
                                           |                         |
                                           +-> sourced extensions    |
                                           |      |                  |
                                           |   authoritative lock    |
                                           |      |                  |
                                           |   acquired canonical ---+-> owned outputs
                                           |                         |
                                           +-> inline configuration -+
                                           |                         |
                                           +-> configured agents ----+
                                               and capabilities
```

- **User intent** is the outcome the user means to achieve.
- **Workspace configuration** records the user's durable choices, including
  extensions, constraints, agents, activation, and workspace capabilities. See
  [Workspace settings](workspace/settings.md).
- **Desired workspace state** is the complete target AXM derives from that
  configuration, including Pack members, inline definitions, configured
  agents, and workspace-level capability configuration.
- **Authoritative lock state** records the accepted immutable external source,
  resolution, integrity, and publisher baseline. See the
  [lockfile](workspace/lockfile.md).
- **Canonical extension content** is the local content AXM obtains or the
  workspace authors for those extensions.
- **Authoring inventory** is workspace-authored canonical content that exists
  for editing and inspection without necessarily being desired or realized.
- **Agent and workspace outputs** present managed capabilities in native
  configuration, directories, instruction files, and other owned surfaces.

Not every desired capability follows every branch. Inline MCP configuration is
authoritative workspace configuration and produces native output without an
extension archive, canonical extension content, resolved extension version, or
lock row.
Instruction-file management produces workspace and agent outputs from its own
configuration plus enabled Rule, Knowledge, or Hook contributions.

Intent may name an extension directly or reach it through a pack. Packs group
extension dependencies under one authored or published choice; they do not erase
the identity or ownership of their members.

These states support one another, but they are not interchangeable. An accepted
lock row does not make an extension desired. An output is not an authoring
source. Workspace-authored canonical content may exist as
authoring inventory without becoming desired. Existing files do not give AXM
permission to overwrite them. The [workspace design](workspace/overview.md)
defines these boundaries in detail.

## The command families

Commands have different jobs depending on which part of that flow the user
wants to affect:

- **Lifecycle commands** such as install, update, and uninstall express user
  intent by changing workspace configuration, then realize the resulting
  desired state for the affected extensions.
- **Workspace configuration commands** select coding agents and manage
  instruction-file behavior without pretending those choices are extensions.
- **Sync** makes managed installed state and outputs match desired state.
  It does not change workspace configuration or advance a satisfying accepted
  resolution.
- **Lint** reports extension and workspace invariants. It describes invalid state
  without guessing user intent or choosing workspace configuration.
- **List and view** inspect state without changing it.
- **Discover** recommends extensions from observed project packages without
  changing workspace intent.
- **Authoring commands** create, convert, or deliberately change
  workspace-authored canonical content without implicitly activating it.
- **Publish** validates and distributes workspace-authored extensions.
- **Type command groups** provide the same extension lifecycle plus capabilities
  that genuinely belong only to that type, such as Knowledge concept retrieval
  or inline MCP configuration.

This division avoids using one command as a general way to repair unrelated
problems. The [command design](commands/overview.md) owns the detailed boundaries.

## Ownership is the safety boundary

AXM changes only the smallest unit for which it can establish authority:

- Workspace-authored extension content belongs to the workspace.
- External extension content is an installed copy managed by AXM.
- Bundled extension content is supplied by the running AXM distribution.
- Native content may belong to AXM, the user, or another tool.
- Managed outputs belong to AXM only while AXM can prove its authority over the
  specific directory, file, entry, or managed region.

AXM does not take ownership merely because content appears in a familiar path.
Unowned content may coexist when an extension type provides an independent
ownership boundary. When it collides with a required output or its authority is
ambiguous, AXM reports the fact, blocks the affected work, and leaves the
content alone. AXM does not adopt even equivalent native content; manual
preservation, relocation, or removal owns recovery.

Operations change workspace state by semantic mutation closure: the smallest
set joined by reachability, combined desired/lock/canonical postconditions,
shared native ownership units, or jointly validated invariants. Independent
ready closures may commit even when another blocks or fails, and the overall
result reports that partial convergence truthfully.

See [Workspace](workspace/overview.md) and [Architecture
principles](principles.md) for the detailed authority and coexistence rules.

## Invalid state should be understandable and recoverable

AXM should make invalid states difficult to create, clear to diagnose, and
possible to leave through ordinary operations. Recovery belongs to one of four
places:

- sync of managed state;
- the lifecycle command that expresses user intent through configuration;
- direct correction of workspace-authored settings or manifests; or
- manual correction of unowned native content.

There is no generic repair workflow. When AXM cannot safely choose the desired
outcome, diagnostics provide the facts and leave that choice to the user or
agent. See [Lint](commands/lint.md) and [Sync](commands/sync.md) for the two
principal sides of this boundary.

Safe execution, interruption, and recovery are shared structural guarantees,
not separate command behaviors. [Workspace execution](workspace/execution.md)
defines those guarantees, and [Workspace invariants](workspace/invariants.md)
defines recovery coverage. The executable specifications remain the source of
truth for exact supported behavior.

## Continue reading

- [Glossary](glossary.md) for recurring AXM-specific terms.
- [Architecture principles](principles.md) for the choices applied across AXM.
- [Workspace](workspace/overview.md) for state, authority, reachability, and
  ownership.
- [Coding agents](workspace/agents.md), [Instruction
  files](workspace/instruction-files.md), and [Sources and
  resolution](workspace/sources.md) for the principal workspace surfaces.
- [Commands](commands/overview.md) for the responsibility of each command family,
  including [authoring](commands/authoring.md).
- [Extensions](extensions/overview.md) for the common extension contract and
  type-specific differences.
- [Lint](commands/lint.md) and [Sync](commands/sync.md) for feature
  responsibilities and invariants.
