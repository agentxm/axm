# AXM overview

Shared product terms such as AgentXM, AXM, agent, extension, extension type,
extension version, registry, workspace, handle, owner, publisher, pack, and
library are defined by
`@agentxm/knowledge/agentxm#domain/extension-model`. This architecture corpus applies
that language to AXM; it does not redefine the shared product model.

AXM manages reusable extensions across coding agents. A user expresses which
extensions a workspace should have through commands and workspace
configuration. AXM derives the complete desired state, obtains and records the
selected extensions, then presents them in the form and location each agent
expects.

The architecture keeps user intent, workspace configuration, desired state, installed
package content, and agent-facing output separate. That separation lets AXM
reconcile current state without silently changing what the user asked for.

## Responsibilities

AXM is responsible for:

- recording explicit workspace choices;
- deriving desired extensions and activation from those choices;
- selecting and recording exact resolutions;
- obtaining and retaining AXM-managed package content;
- presenting managed content to configured agents;
- diagnosing invariant violations; and
- safely reconciling managed current state with desired state.

## Non-responsibilities

AXM is not responsible for:

- defining shared AgentXM product language or extension standards;
- inferring choices the user has not expressed;
- adopting, rewriting, or deleting workspace-authored or unmanaged content
  without explicit authority;
- treating existing files or lock entries as declarations of intent;
- making every invalid state automatically fixable; or
- providing a generic health, repair, or policy-enforcement system beyond its
  extension-management responsibilities.

The remaining documents divide AXM's responsibilities among workspace state,
commands, lint, sync, settings, and the lockfile.

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
service contracts and OSS-safe packages, never on private repository source,
paths, or documentation. Contracts shared with the private platform belong in
the public shared kernel only when both implementations must use identical
meaning.

## The workspace flow

```text
user intent
    |
    v
workspace configuration  ->  desired state  ->  locked resolutions
                                                   |
                                                   v
                                          installed package content
                                                   |
                                                   v
                                              agent outputs
```

- **User intent** is the outcome the user means to achieve.
- **Workspace configuration** records the user's durable choices, including
  extensions, constraints, agents, and activation. See
  [Workspace settings](settings.md).
- **Desired state** is the complete target AXM derives from that configuration,
  including dependencies and trusted extension metadata.
- **Locked resolutions** are the exact versions and sources selected for the
  desired extensions. AXM records them in the [lockfile](lockfile.md).
- **Installed package content** is the content AXM obtains or the workspace
  authors for those extensions.
- **Agent outputs** present managed package content in each agent's expected
  form and location.
- **Trust** records the accepted identity of an external source.

Intent may name an extension directly or reach it through a pack. Packs group
extension dependencies under one authored or published choice; they do not erase
the identity or ownership of their members.

These states support one another, but they are not interchangeable. A locked
resolution does not make an extension desired. An agent output is not an authoring
source. Existing files do not give AXM permission to overwrite them. The
[workspace design](workspaces.md) defines these boundaries in detail.

## The command families

Commands have different jobs depending on which part of that flow the user
wants to affect:

- **Lifecycle commands** such as install, update, and uninstall express user
  intent by changing workspace configuration, then realize the resulting
  desired state for the affected extensions.
- **Sync** makes managed installed state and projections match desired state.
  It does not change workspace configuration or advance a satisfying locked
  resolution.
- **Lint** reports extension and workspace invariants. It describes invalid state
  without guessing user intent or choosing workspace configuration.
- **List and view** inspect state without changing it.
- **Publish** validates and distributes workspace-authored extensions.
- **Type namespaces** provide the same extension lifecycle plus capabilities that
  genuinely belong only to that extension type.

This division avoids using one command as a general way to repair unrelated
problems. The [command design](commands.md) owns the detailed boundaries.

## Ownership is the safety boundary

AXM distinguishes content it may manage from content it must preserve:

- Workspace-authored extension content belongs to the workspace.
- External extension packages are installed copies managed by AXM.
- Bundled extension packages are supplied by the running AXM distribution.
- Unmanaged agent content belongs to the user or another tool.
- Projections belong to AXM only when AXM created and still owns them.

AXM does not take ownership merely because content appears in a familiar path.
When unmanaged content occupies a path AXM needs, AXM reports the collision and
leaves the content alone.

## Invalid state should be understandable and recoverable

AXM should make invalid states difficult to create, clear to diagnose, and
possible to leave through ordinary operations. Recovery belongs to one of four
places:

- a meaning-preserving `lint --fix` normalization;
- sync of managed state;
- the lifecycle command that expresses user intent through configuration; or
- direct correction of workspace configuration.

There is no generic repair workflow. When AXM cannot safely choose the desired
outcome, diagnostics provide the facts and leave that choice to the user or
agent. See [Lint](lint.md) and [Sync](sync.md) for the two principal sides of
this boundary.

## Safe changes

A successful operation produces its whole promised result for the extensions that
must change together. A handled failure leaves that work unchanged. Unrelated
invalid extensions do not block a valid scoped operation, and independent work
may make progress independently when AXM can report that progress honestly.

Repeated commands are safe: the same successful operation makes no further
changes on its second run. Concurrent changes must not interleave, stale plans
write nothing, and interrupted work can be finished safely later without
endangering authored or unmanaged content.

## Verification authority

Behavior tests are the source of truth for supported behavior. Architecture
documents record only a testing approach that is consequential and difficult to
infer from individual tests, such as completeness checks for lint errors and
sync blockers. They do not maintain scenario catalogs or prescribe test files.

## Continue reading

- [Architecture principles](principles.md) for the choices applied across AXM.
- [Workspaces](workspaces.md) for state, authority, reachability, and ownership.
- [Commands](commands.md) for the responsibility of each command family.
- [Lint](lint.md) and [Sync](sync.md) for feature responsibilities and
  invariants.

---

status: stable
description: How AXM commands, workspace state, ownership, and verification fit together.
---
