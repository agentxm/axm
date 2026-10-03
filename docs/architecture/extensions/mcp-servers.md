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

A sourced connection has three related identities:

- its **local connection name**, used as the `mcpServers` settings key and the
  agent-native server key;
- its **source identity**, formed from source authority and published package
  identity; and
- its **accepted resolution**, such as an exact Registry version and archive
  integrity.

The local name is chosen with `axm mcps install <source> --as <name>`. Omitting
`--as` uses the published package name. Local names use the ordinary extension
name grammar and are unique within the selected workspace scope.

The MCP command group may add, import, or inspect server definitions. Import is
a separately invoked authoring capability outside the workspace-recovery
contract; observation and reconciliation never invoke it or infer its intent.
Import reads native configuration through the agent-adapter readers and adopts
JSON-like, YAML and independently editable TOML entries through the same
writers. Import accounts for every native field, preserves activation and
literal meaning, and refuses unsupported semantics. A batch rechecks source
fingerprints and configured reader interpretations inside one rollback boundary.
Explicit name selection narrows that batch; a blocker prevents the selected
batch from committing.

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

Authority is structural in the workspace model. A sourced definition carries a
source locator. An inline definition carries an explicit `connection` and no
source locator. Both use object declarations. The connection names `stdio`,
`streamable-http` or `sse`; a stdio executable is one literal token with a
separate ordered argument vector. Values are literals, explicit environment
references or typed concatenations. A string never acquires interpolation or
shell semantics from its spelling. An omitted working directory means the
native host default; explicit directories retain their scope or absolute base.

An authorizing install selects one source distribution before projection.
Settings persist its normalized identifying properties separately from its
version. Subsequent sync and update match that selector; they neither choose
another distribution for an agent nor substitute a subprocess bridge. Input
bindings address only the selected distribution, with distinct environment,
header, URL-variable, runtime-argument and package-argument targets. Missing,
ambiguous, unused and unsafe bindings block settlement.

Several sourced connections may carry different local names while referencing
one source identity. They share one acquired canonical package and accepted
lock resolution, but retain separate distribution choices, input bindings,
activation and native entries. Workspace membership determines agent targeting. Every version constraint from
those connections and any depending Pack contributes to one source closure. An
update selected by any local name or by exact source advances and reprojects the
whole closure.

For a publishable MCP Server extension, the server name, transport, external
software-package or endpoint identity, inputs, and runtime requirements are
author declarations. AXM may validate them or import them from an explicit
native source, but it does not invent a package name, endpoint, or connection
that merely looks plausible.

An inline connection that is valid workspace configuration is not thereby a
publishable extension package. A new package scaffold can establish editable
workspace content while its connection definition remains unfinished; the
executable specification `cli/mcps/new/creates-enabled-workspace-content`, in
the [specification catalog](../../../specifications/catalog.md), owns the
declaration and activation outcome. Publication applies its separate
eligibility checks to the supplied connection identity.

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

The existing version-1 `x-axm` metadata remains the ownership format. Its `ext`
and `ref` identify the published package while the containing native map key or
TOML region identifies the local connection. Supporting local names therefore
does not require an ownership-format version change.

Uninstall selects a local connection name. It removes only that connection's
settings and projections while another local connection or Pack route still
needs the source. The final removal also deletes the shared accepted resolution
and acquired canonical package.

MCP credentials belong to the native host. AXM retains symbolic environment
references or native OAuth intent and never obtains their values. Known
credentials in literal settings, URLs or process arguments are refused. MCP
operations do not read, write or erase OS credential entries; existing entries
remain untouched. Registry authentication has its own independent owner.

Users who previously saved MCP secrets can remove obsolete entries through
their operating system's credential manager, selecting the `axm-mcp` service.
Its account names are opaque connection/input digests. Review the service
identity before removal; do not remove Registry-login or native-host entries.
This cleanup is user-directed and is never part of install or uninstall.

Inspection is passive. It separates configuration and projection facts from
readiness and reports runtime as `not-checked`. A source version lock does not
prove that the external runtime artifact is pinned. Native trust, approvals,
environment availability, OAuth and reload requirements remain host actions.

## Invariants

- The projected server preserves the meaning supported by the target agent's
  MCP dialect.
- Workspace input values and secrets never appear in diagnostics, plans, or
  machine results.
- Read-modify-write operations preserve unowned native configuration.
- Same-target updates are serialized and stale observations write nothing.
- Source-closure updates resolve once and refresh every local connection in the
  closure.
- Unsupported lossless realization is a blocker, not permission to degrade the
  server definition.

## Testing strategy

Behavior tests prove canonical-content and inline authority, input binding,
secret-safe output, unrelated-entry preservation, same-name collisions,
provenance drift, explicit import boundaries, manual unowned-collision
recovery, target-dialect rendering, shared-target concurrency, unsupported
transports, activation, safe removal, repeated reconciliation, local-name
coexistence, shared source resolution, closure-wide updates, and one-at-a-time
uninstall.

JSON and YAML entries prove ownership through versioned `x-axm` metadata with
the extension or workspace-local inline identity in `ext`, plus source and
reference provenance.
TOML uses one `region=mcp-server:<name>` fence per server so AXM can replace
only that byte range without an AST round trip that reformats unrelated user
configuration. Both forms follow the shared
[managed-file ownership contract](../workspace/managed-file-ownership.md).
