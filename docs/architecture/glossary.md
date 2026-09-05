---
type: Architecture
status: stable
description: AXM-specific meanings of terms used throughout the architecture corpus.
depends-on:
  - "@agentxm/knowledge/agentxm#domain/extension-model"
---

# Glossary

This glossary defines recurring AXM terms whose meaning may not be clear from
ordinary usage. Shared AgentXM terms such as extension, extension version,
extension archive, software package, companion package, pack, registry, handle,
and FQN are defined by
`@agentxm/knowledge/agentxm#domain/extension-model` and its related concepts.

This corpus does not use **namespace** as a synonym for a handle, an FQN's
owner scope, or a command group. Formal external meanings, such as the Package
URL namespace component or a repository namespace, remain unchanged.

## Managed output

A file, configuration entry, directory, alias, or managed region AXM derives
from desired workspace state. Most managed outputs derive from canonical
extension content; others, such as inline MCP entries and instruction aliases,
derive directly from workspace configuration.

An **agent output** is a managed output in the form and location a configured
agent expects. Other managed outputs may belong to a shared workspace surface.

## Authority

The right and responsibility to decide or change a specific unit of workspace
state. AXM establishes authority from authored configuration, accepted source
and resolution state in the authoritative lockfile, bundled identity, or
type-appropriate ownership evidence.
A path, name, or matching content alone does not establish authority.

## Accepted resolution

The exact external version or immutable content identity AXM accepted after
resolving a desired sourced extension. The authoritative lockfile records this
baseline so AXM can verify or, where supported, reacquire the same content. An
accepted resolution does not create desired-state reachability.

## Authoritative lockfile

The generated, committed `axm-lock.yaml` project state (or user-scope
`axm-lock.yaml`) that records accepted external resolutions, package-tree
integrity, and provenance. It participates in planning and exact
materialization, but never creates desired membership, activation, Pack
reachability, projection ownership, or cleanup authority.

## Authoring inventory

Workspace-authored canonical extension content available for direct editing,
inspection, versioning, and publication preparation without necessarily being
desired or active in the workspace. Creating authoring inventory does not by
itself create a settings entry or managed output.

## Bundled extension

An extension whose canonical extension content is supplied and controlled by the running
AXM distribution. It is neither authored by the workspace nor acquired from a
configured external source.

## Canonical extension content

The local extension content from which AXM derives agent projections. It may be
workspace-authored, installed from an external source, or supplied with AXM. A
projection is not an additional canonical copy, and the content need not remain
byte-identical to the extension archive from which it was installed.

Inline MCP definitions and workspace capability configuration are
authoritative settings, not canonical extension content. AXM does not create a
placeholder canonical copy merely to make them look like sourced extensions.

## Configured agent

A coding agent selected in workspace settings to receive AXM-managed outputs.
An agent may be supported by AXM or detected on the machine without being
configured for the workspace. Detection and support do not create configuration
or grant authority over the agent's native files.

## Contributor set

The set of extensions whose realization one ownership unit carries, derived
only from the desired-state graph — settings plus Pack expansion. A
single-contributor unit carries exactly one extension. An aggregate unit
carries every extension its membership rule reaches and is always written as a
whole from that set.

## External extension

An extension AXM acquired from a registry or another supported source, rather
than one authored by the workspace or bundled with AXM. AXM manages the
installed canonical extension content. Local edits do not make it
workspace-authored; changing that authority requires an explicit operation.
External does not mean public, remote, or unowned.

## Manifest

A type-specific metadata file describing an extension. Its filename, schema,
and allowed fields depend on the extension type. A workspace-authored manifest
is editable workspace configuration; a manifest acquired from an external
source is managed extension content.

## Local MCP connection name

The workspace-local identity of one MCP connection. It is the key in
`mcpServers` settings and in an agent's native MCP map or marked region. It may
differ from the published MCP Server extension name, and multiple local names
may reference one source identity while retaining separate realization choices
and secret namespaces.

## MCP source-resolution closure

All local MCP connections and Pack routes that reference one source identity.
The closure combines their version constraints and shares one accepted
resolution and acquired canonical package. Updating any member advances the
closure; shared source state remains until its final route is removed.

## Ownership unit

The smallest native unit of a managed output that AXM can own, observe, and
change independently — a directory, file, named entry, or marked region. Each
extension type declares its units and whether each carries one contributor or
many; the ownership table in the
[extension architecture](extensions/overview.md#ownership-and-coexistence) is
authoritative.

## Projection

An AXM-owned managed output unit derived from desired workspace state, whether
from canonical extension content or, as with inline MCP entries and
instruction aliases, directly from workspace configuration. All projections
follow the same ownership, reconciliation, and projection-fact rules. A
projection is AXM-owned only when AXM created and still owns it; occupying an
expected path does not establish ownership.

## Source

The origin from which an extension's canonical extension content is authored, resolved,
or acquired. A source may be workspace-authored, registry-hosted, another
supported external source, or bundled with AXM. A source reference alone does
not make an extension desired, establish an accepted resolution, or authorize AXM to overwrite
existing content.

A **source reference** is the user- or configuration-facing value that names a
source and may include a version constraint. A **source identity** is the
stable origin AXM accepts and records in the authoritative lockfile.

## Semantic mutation closure

The smallest set of workspace state that must validate, change, and roll back
together. Reachability relationships, combined desired/lock/canonical
postconditions, shared native ownership units, and invariants requiring joint
validation connect work into a closure. Physical co-location in one settings,
lock, or native file does not by itself connect otherwise independent work.

## Source host

A configured service or endpoint through which AXM resolves source references.
A source host says how to reach a source; it does not identify a particular
extension or version.

## Unowned content

Observed content for which AXM cannot establish authority. Unowned describes
AXM's relationship to a specific occurrence, not the extension's lifecycle or
the validity of the workspace. Depending on its type and location, unowned
content may coexist independently, collide with desired output, or make
authority ambiguous. AXM does not adopt, rewrite, or remove it. Manual
preservation, relocation, or removal owns recovery when it blocks required AXM
output.

## Workspace

The local AXM management boundary whose configuration, authoritative lock
state, canonical extension content, inline definitions, and managed outputs
describe and realize one desired state. A workspace operates in either project
or user scope.

## Workspace-authored extension

An extension whose canonical extension content belongs to and may be edited
directly by the workspace. AXM may validate, project, and publish it, but does
not overwrite or delete its content as an incidental lifecycle or recovery
action.

## Workspace scope

The workspace boundary selected for an operation: project or user. Workspace
scope determines which workspace state and managed outputs a command may read
or change. It is distinct from selecting particular extensions within that
workspace.
