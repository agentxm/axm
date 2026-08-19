---
type: Architecture
status: stable
description: How AXM manages MCP server definitions from extension content or inline configuration across native agent configuration.
depends-on:
  - ./overview.md
  - ../workspace/settings.md
  - ../workspace/managed-file-ownership.md
---

# MCP Servers

An MCP Server extension describes a connection that AXM translates into each
configured agent's native Model Context Protocol configuration.

## Responsibilities

AXM preserves the MCP server definition, binds workspace-specific inputs, and
merges an owned server entry into each supported native configuration. It
supports both published extension content and explicit inline workspace
configuration because local server connections are a routine MCP use case.

The MCP command group may add, import, or inspect server definitions. Import is
a separately invoked authoring capability outside the workspace-recovery
contract; observation and reconciliation never invoke it or infer its intent.

## Non-responsibilities

AXM does not run or supervise MCP servers, provision their runtime or software
dependencies, manage vendor accounts, define protocol semantics, or claim
ownership of an entire native configuration file. It does not make an
unrepresentable server portable by silently dropping transports, inputs,
headers, or authentication requirements.

## State and realization

A server definition from an extension is canonical extension content. An inline
server definition is authoritative workspace configuration. Native MCP entries
are derived outputs in both cases. An inline definition has no fabricated
extension archive, canonical extension content, or resolved extension version;
no artificial lock row is created. AXM owns only entries
it created and can still identify; unrelated entries and surrounding
configuration remain untouched.

For a publishable MCP Server extension, the server name, transport, external
software-package or endpoint identity, inputs, and runtime requirements are
author declarations. AXM may validate them or import them from an explicit
native source, but it does not invent a package name, endpoint, or connection
that merely looks plausible.

An inline connection that is valid workspace configuration is not thereby a
publishable extension package. A new package scaffold may remain incomplete
authoring inventory until real connection identity is supplied, and remains
outside desired state unless the author explicitly activates it. Publish
rejects missing or placeholder identity rather than repairing the scaffold.

## Ownership and coexistence

One named server entry is the native ownership unit; the containing file is
not. Entries with different names coexist. An unowned entry with the name AXM
must realize is a collision, even when its connection details happen to match.

AXM-managed entries carry type-appropriate provenance that survives ordinary
serialization changes. AXM may update or remove only that entry. A native
format that cannot preserve unrelated entries or identify AXM's entry safely is
unsupported. Even an equivalent unowned entry remains unowned during ordinary
observation and reconciliation; manual preservation, relocation, or removal
owns collision recovery.

## Invariants

- The projected server preserves the meaning supported by the target agent's
  MCP dialect.
- Workspace input values and secrets never appear in diagnostics, plans, or
  machine results.
- Read-modify-write operations preserve unowned native configuration.
- Same-target updates are serialized and stale observations write nothing.
- Unsupported lossless realization is a blocker, not permission to degrade the
  server definition.

## Testing strategy

Behavior tests prove canonical-content and inline authority, input binding,
secret-safe output, unrelated-entry preservation, same-name collisions,
provenance drift, explicit import boundaries, manual unowned-collision
recovery, target-dialect rendering, shared-target concurrency, unsupported
transports, activation, safe removal, and repeated reconciliation.

JSON and YAML entries prove ownership through versioned `x-axm` metadata with
the extension or workspace-local inline identity in `ext`, plus source and
reference provenance.
TOML uses one `region=mcp-server:<name>` fence per server so AXM can replace
only that byte range without an AST round trip that reformats unrelated user
configuration. Both forms follow the shared
[managed-file ownership contract](../workspace/managed-file-ownership.md).
