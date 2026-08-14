---
status: stable
description: The common AXM extension contract and the architectural axes on which extension types differ.
depends-on:
  - ../overview.md
  - ../workspace/overview.md
  - ../commands/overview.md
---

# Extensions

An extension type says what AXM manages and how that content becomes useful in
a workspace. Types share identity and lifecycle semantics, but differ in their
canonical representation, placement, governing standard, and realization.

## Responsibilities

This section owns:

- the common architectural contract every extension type follows;
- the axes on which type behavior intentionally differs;
- the authority boundary between canonical content and derived outputs; and
- the distinctive responsibilities and invariants of each type.

## Non-responsibilities

This section does not inventory manifest fields, command flags, diagnostic
codes, supported agents, native file formats, or current implementation
modules. Schemas, CLI help, code, and behavior tests own those executable
contracts. Shared AgentXM knowledge owns product-wide definitions and external
standards.

## Common contract

Every extension has an owner-scoped identity and exactly one type. Published
versions are immutable. A configured extension participates in desired state,
activation, and lifecycle through the common workspace and command model.
Resolution and trust apply when its source requires them.

Workspace settings distinguish an extension entry from configuration for a
capability as a whole. An entry expresses one desired extension, source, and
activation. Some capability configuration belongs to the workspace itself,
such as instruction-file management; some belongs to an extension type, such
as Knowledge discovery publication. Changing capability configuration does not
silently change extension intent or activation.

Leaf extensions retain canonical content and may produce agent or workspace
outputs. Packs are containers: they contribute a dependency graph rather than
content projections. Enabling or disabling a Pack activates or suspends that
dependency route; it does not activate a Pack runtime or erase members that
remain reachable elsewhere. Inline MCP definitions are an explicit exception
to the sourced-extension path: settings are authoritative and no extension
archive, canonical extension content, or resolved extension version is
fabricated. Successful realization may still produce receipt history.
Type-specific commands may add authoring, import, inspection, or discovery
capabilities, but do not redefine lifecycle policy.

## Architectural differences

| Type       | Placement | Canonical state                                    | Realization                                       |
| ---------- | --------- | -------------------------------------------------- | ------------------------------------------------- |
| Skill      | Per agent | Extension content                                  | Agent skill directories                           |
| MCP Server | Per agent | Extension content; settings for inline definitions | Native MCP configuration                          |
| Subagent   | Per agent | Extension content                                  | Native profiles or capability-preserving fallback |
| Rule       | Workspace | Extension content                                  | Managed Rule contribution to instruction files    |
| Hook       | Per agent | Extension content                                  | Native hook configuration or explicit fallback    |
| Knowledge  | Workspace | Extension content                                  | Knowledge index and compact discovery surface     |
| Pack       | Container | Pack manifest                                      | Activated route into the desired dependency graph |

Placement defines where realized state belongs, not where authors edit it.
Canonical content remains authoritative over projections. Existing native or
workspace output targets remain unowned by AXM unless it can establish its
authority over the specific output it needs to change.

A governing standard may define canonical extension content, a runtime
protocol, or a host file convention. AXM preserves that boundary rather than
treating every type as an AXM-specific file format.

## Ownership and coexistence

Each extension type defines the smallest native unit AXM can own. That unit is
the boundary for observation, collision detection, reconciliation, and removal:

| Type       | Native ownership unit                                   |
| ---------- | ------------------------------------------------------- |
| Skill      | One agent-facing Skill directory                        |
| MCP Server | One named native configuration entry                    |
| Subagent   | One native profile file or named entry                  |
| Rule       | The managed Rule contribution region                    |
| Hook       | One identifiable hook entry or the Hook fallback region |
| Knowledge  | The derived index and the managed discovery region      |
| Pack       | None; a Pack realizes only desired-state relationships  |

Different unowned units may coexist when the native format preserves them
independently. The same required unit, malformed ownership evidence, or a format
that cannot preserve surrounding content is a blocker. AXM never widens
ownership from an entry or region to the containing file merely because it must
use read-modify-write.

Every type document states how its unit is identified, what can coexist, what
collides, and what AXM may remove. Observation alone never adopts native
content; any adoption is an explicit type-specific operation.

## Invariants

- Type identity does not change across configuration, resolution, canonical
  content, or projections.
- Inline configuration does not acquire a fictitious extension identity or
  canonical extension content merely to participate in managed output.
- A projection never becomes canonical merely because an agent can use it.
- Activation changes realized outputs without changing extension identity or
  authorship.
- Type-specific capabilities do not bypass shared ownership, trust,
  transaction, or lifecycle rules.
- An output is changed or removed only while AXM can establish authority over
  that type's ownership unit.
- Unsupported realization blocks only the affected work and does not justify
  a lossy fallback.

## Testing strategy

A catalog-driven conformance suite proves shared lifecycle, scope, authority,
preview, idempotence, reachability, and output obligations for every type. It
covers independently coexisting unowned content, direct collisions, ambiguous
ownership, stale owned output, and safe removal. Each type then tests only its
architectural differences: canonical form, supported sources, ownership unit,
projection or merge behavior, type-specific capabilities, and unsupported
targets. Behavior tests remain the source of truth for exact scenarios and
formats.
