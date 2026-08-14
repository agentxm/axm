---
status: stable
description: The relationship among user intent, desired state, current state, ownership, and safe workspace changes.
depends-on:
  - ../overview.md
  - ../principles.md
---

# Workspaces

The shared product model defines a workspace as a local scope in which AXM
manages extensions. This document defines AXM's architecture within that
boundary.

An AXM workspace records explicit user choices and contains the state needed to
realize the resulting desired state across coding agents and shared workspace
surfaces. Reliability depends on keeping user intent, workspace configuration,
desired state, and current state distinct.

## Responsibilities

The workspace model owns:

- the separation of configuration, desired state, and current state;
- configured agent targets and workspace capability state;
- authority and ownership for canonical extension content, inline
  configuration, and managed outputs;
- reachability and retention across direct and Pack-derived routes;
- the relationship between resolutions, trust, content, and projections; and
- safety boundaries for changes within one workspace scope.

## Non-responsibilities

The workspace model does not own:

- shared AgentXM product definitions, which come from the AgentXM Knowledge
  bundle;
- the fields and editing rules of `settings.json`, which belong to
  [Workspace settings](settings.md);
- configured-agent semantics, which belong to [Coding agents](agents.md);
- canonical instruction files and aliases, which belong to [Instruction
  files](instruction-files.md);
- source-host precedence and resolution policy, which belong to [Sources and
  resolution](sources.md);
- lockfile contents and regeneration rules, which belong to the
  [Lockfile](lockfile.md);
- accepted external source identity, which belongs to [Trust](trust.md);
- evaluation and recovery coverage of invalid workspace state, which belong to
  [Workspace invariants](invariants.md);
- which command expresses an action, which belongs to
  [Commands](../commands/overview.md);
- type-specific canonical state and realization, which belong to
  [Extensions](../extensions/overview.md);
- diagnostic and reconciliation behavior, which belong to
  [Lint](../commands/lint.md) and [Sync](../commands/sync.md); or
- agent-specific serialization mechanics, which belong to adapters and their
  tests.

## From user intent to desired state

User intent is the outcome the user means to achieve. AXM cannot know unstated
intent; it acts on choices the user expresses through commands or direct edits.

Workspace configuration records those durable choices: directly requested
extensions, version constraints, agents, activation, inline definitions,
workspace capabilities, and workspace-authored manifests. The [workspace
settings design](settings.md) owns the `.axm/settings.json` boundary. AXM
combines that configuration with trusted extension metadata to derive the
complete desired state, including Pack members and the outputs required for
configured agents.

Trust and provenance record accepted source and resolution state. Installed
files and managed outputs realize current state. Receipt history records
completed work after the fact. None creates desired state on its own. Some
desired capability state, such as inline MCP configuration and instruction-file
management, does not require a sourced extension or canonical extension
content.

## Workspace state

| State                       | Role                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------- |
| Workspace configuration     | Records the user's explicit, durable choices in [settings](settings.md).            |
| Desired state               | Describes desired extensions, activation, agents, and workspace capabilities.       |
| Trust and provenance        | Record the accepted source and resolution baseline; see [Trust](trust.md).          |
| Canonical extension content | Holds authored or acquired content from which projections are produced.             |
| Inline configuration        | Authoritatively defines a managed capability directly in settings.                  |
| Managed outputs             | Present desired capabilities in agent or workspace-native surfaces.                 |
| Observed content            | Records what exists without implying desired state or authority.                    |
| Receipt history             | Records completed resolution and materialization work; see [Lockfile](lockfile.md). |

Workspace configuration answers which explicit choices the user has made.
Desired state expands extension choices through Pack membership and derives
the outputs required by configured agents and workspace capabilities. Accepted
resolutions, receipt rows, and existing files do not make an extension or
capability desired.

## Authority across workspace surfaces

AXM interacts with three distinct surfaces. Authority must be established on
the surface being changed; it does not transfer merely because the same name or
content appears on another surface.

### Canonical extension content

Canonical extension content has one of three authorities:

- **Workspace-authored:** The workspace is the source. AXM never overwrites or
  deletes it as an incidental lifecycle or recovery action.
- **External:** AXM installed a copy from a registry or other supported source.
  The extension remains AXM-managed even if its local bytes change, but ordinary
  sync does not overwrite that drift.
- **Bundled:** The running AXM distribution supplies and controls the content.

Changing an extension among workspace-authored, external, and bundled authority
is an explicit operation. Receipt history, a trust record, or a recommended
Pack does not silently change authority.

Workspace-authored content may exist as authoring inventory without being
desired or active. Its presence does not create settings or accepted trust, and
AXM does not delete it merely because it is unreachable from desired state.

Externally acquired content is managed installed state only when AXM can relate
it to accepted source and resolution evidence. If that authority cannot be
established, AXM preserves the content and reports the ambiguity rather than
treating its location as permission to adopt or remove it.

### Agent-native content

Agent-native surfaces may contain content created by AXM, a user, or another
tool. Each extension type defines its smallest independently owned unit and
whether unrelated units can coexist. AXM does not require exclusive ownership
of a native file or directory when a narrower safe boundary exists.

Instruction files are a shared workspace-native surface with independently
owned regions and aliases. Inline MCP definitions are authoritative settings;
their native entries are derived agent outputs. Neither case requires
canonical extension content merely to fit the ordinary sourced-extension flow.

### Managed outputs

AXM owns only outputs it created and can still identify. Ownership evidence is
type-specific and survives ordinary formatting or serialization changes. Name,
path, and byte equality are observations, not ownership proof.

## Reachability and retention

AXM-managed installed state is retained when its extension is reachable from
desired state. Direct extension configuration and Pack membership can make an
extension reachable. Accepted trust or receipt history does not keep an
otherwise undesired extension installed. Workspace-authored inventory is
preserved by authorship, not retained by desired-state reachability.

Removing one route to an extension does not remove it while another desired
route still reaches it. Cleanup that depends on knowing the complete desired
graph waits until that graph can be resolved completely.

Registry packs depend on registry extension identities and version constraints.
A local copy of a registry pack contributes dependency meaning only when its
manifest matches the trusted registry manifest. Workspace-authored pack
manifests are workspace configuration and may be edited directly.

## Accepted resolutions, trust, and receipts

[Trust](trust.md) records the external source and resolution accepted at
acquisition. An accepted resolution that still satisfies desired constraints
remains stable. Missing external canonical extension content can be reacquired
from that baseline where the source supports it. Updating, not syncing, owns
advancing it.

Receipt history records successful work after these decisions. It does not pin
the resolution, reconstruct trust, or participate in planning. Desired
capabilities without a source have no fabricated extension resolution, though
their successful realization may have a receipt.

Trust does not make later local byte drift a standing security violation.
Replacing divergent external content during an explicit update or reinstall
must be disclosed.

## Output reconciliation

Managed outputs are derived and AXM-owned only while AXM can prove their
authority. Every agent adapter and workspace-surface writer follows the same
four rules:

- Create a missing AXM-owned projection.
- Restore a stale AXM-owned projection.
- Remove an obsolete AXM-owned projection.
- Block on an unowned collision and never overwrite it.

Unowned native content may coexist only when the extension type establishes an
independent boundary. Content occupying a required unit is a collision; content
whose authority cannot be determined is ambiguous. AXM preserves both and
blocks only the affected work.

## Safe workspace changes

Two AXM changes to the same workspace scope must not interleave. Immediately
before writing, AXM checks that the inputs and targets still match the proposed
change. If they do not, it writes nothing.

Workspace configuration, trust, canonical extension content, inline
configuration, and managed outputs change as one unit for work that must change
together. A handled business failure leaves that work unchanged. Receipt
history is persisted afterward; its failure is reported without rolling back
completed business state.

Abrupt termination must not leave a partly written authoritative file or lose
authored or unowned content. A later run can safely finish from the remaining
authoritative state. [Workspace execution](execution.md) owns the structural
guarantees behind these changes, while [workspace invariants](invariants.md)
owns validity and recovery coverage.
