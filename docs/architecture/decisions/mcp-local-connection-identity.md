---
type: Decision
status: stable
description: MCP local names identify connections and native projections, while source authority and published package identity define shared resolution.
depends-on:
  - ../extensions/mcp-servers.md
  - ../workspace/lockfile.md
  - ./executable-specifications-authority.md
---

# MCP local names are connection identity, not source identity

## Decision

Treat the key of a sourced `mcpServers` settings entry as a local connection
identity. Resolve and lock the package by source authority plus published
package identity. Connections that reference the same source form one
source-resolution closure: they share acquisition and accepted resolution, but
each keeps its local name, inputs, activation, projection, and secret
namespace. Every connection reaches every configured agent that can represent
it; see [Agent targeting is workspace membership](agent-targeting-is-workspace-membership.md).

Keep the existing version-1 native ownership metadata. Published package
identity remains in its provenance fields, while the containing native key or
region identifies the local connection.

## Context

One MCP Server package can support several useful connections in a workspace,
such as separate accounts, environments, or data boundaries. A model that uses
the published package name simultaneously as settings key, native key, lock key,
canonical identity, and credential namespace cannot represent those
connections without duplicating or contradicting source state.

## Consequences

- `install --as` creates or replaces one local connection without changing the
  published package identity.
- All constraints contributed by local connections and Packs for one source
  must intersect before that source can be resolved.
- Updating one member advances the entire source closure and refreshes all of
  its projections.
- Uninstalling one local connection retains shared acquired state until no
  local connection or Pack route needs it.
- Machine inventory exposes local connection, source, and accepted resolution
  as distinct fields.
- Credential accounts incorporate workspace scope, local connection, source
  identity, and input name.

The executable specifications under `specifications/cli/mcps/` own these
accepted behaviors; this record explains the identity choice and its durable
effects.

## Alternatives

Using the published package name as the only identity was rejected because it
permits only one connection per source. Copying one lock and canonical package
per local name was rejected because it creates independently advancing
resolutions for what is still one source package. Adding a new ownership marker
version was rejected because the existing marker already separates the native
unit's key from its package provenance.

## Reconsideration

Reconsider if an external MCP configuration standard supplies a portable,
first-class connection identifier whose semantics replace the native map key,
or if a source can legitimately resolve different package versions for
different local connections within one workspace.
