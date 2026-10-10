---
type: Architecture
status: stable
description: How configured coding agents determine the native surfaces AXM manages.
depends-on:
  - ./overview.md
  - ./settings.md
---

# Coding agents

A configured agent is a coding-agent harness selected in workspace settings to
receive AXM-managed capabilities. Configuration is an explicit workspace
choice; support and local detection are observations that help the user make
that choice.

## Responsibilities

AXM distinguishes supported, detected, and configured agents. It records the
configured target set at project or user scope, models the capabilities each
target exposes, and derives the agent outputs required by desired workspace
state.

Adding or removing an agent changes that durable target set and reconciles the
AXM-owned outputs affected by the change. A target that cannot represent a
required capability is reported before AXM writes a partial or lossy result.

## Non-responsibilities

AXM does not install, launch, update, authenticate, or otherwise administer a
coding-agent product. Detection does not configure an agent, and an installed
agent does not become part of desired state merely because AXM recognizes it.

Agent support does not authorize AXM to own the agent's files or configuration.
Each extension type still establishes the smallest native unit AXM may change,
and unrelated native content remains outside AXM authority.

## Targeting and realization

Project and user scopes have independent configured target sets. Selecting an
agent in one scope does not add it to the other. An operation changes only the
outputs belonging to its selected scope.

Canonical extension content remains agent-independent unless the extension
contract permits bounded targeting. Agent-specific files are derived outputs,
not additional authoring sources. [Agent-specific extension content](../extensions/targeting.md)
defines the portable baseline and enhancement boundary.

## Capability authority and adapters

The capability catalog is the single authority for whether an agent exposes a
native extension surface and whether AXM has a verified writer for it. Runtime
services, workspace scanners, setup choices, and lint rules derive their
support decisions and paths from that catalog. A missing Skill descriptor means
AXM has no verified writable Skill surface; AXM does not synthesize a directory
from the agent ID.

Native reader declarations identify scope, root anchor, path, storage shape,
role, applicability, and evidence. Primary locations and additional readers
remain distinct. User scope resolves against captured user and configuration
roots; missing user-scope evidence never falls back to a project path.
Environment-selected locations use inputs captured at the workspace boundary.

Agents use catalog-driven adapters for common Skill, MCP, and Subagent
behavior. Writer support also requires the declared shape and renderer to be
implemented. A known native reader can therefore remain an unsupported AXM
writer. Adding an agent's ordinary capability does not require a bespoke
service module.

The workspace read model follows the same boundary. Its common declared,
actual, and detected projectors are generated from the catalog. Agent-specific
native configuration belongs in catalog data and captured location inputs,
not in placeholder per-agent projection modules or phantom configuration types.

## Evidence and product identity

A catalog ID identifies a concrete integration target and survives a product
rename. Product, interface, edition, responsible company, parent company, and
model provider are distinct facts. Record relationships only when authoritative
sources establish them. An edition's retirement does not retire a still-supported
target; retain the qualification beside its effective lifecycle.

Native capability availability distinguishes documented support, plugin support,
documented absence, and unknown. A missing source or an unsuccessful search is
unknown. Source review records its date, sources, conditions, and limitations;
it does not certify vendor execution. AXM configuration tests and actual vendor
runtime exercises identify their own boundary, evidence, and date. Historical
dates without a recorded method remain historical dates.

The release catalog is a versioned public data contract derived from the same
records. It exposes qualified extension-type integration, delivery, material
restrictions, and evidence without exporting writer implementation. A type-level
integration result does not establish compatibility with every package of that
type. Conditional, manual, unsupported, and unknown outcomes remain visible to
consumers; a native feature alone never implies an AXM writer.

Native hook mechanisms and events may exceed AXM's canonical vocabulary and
implemented serializers. Such facts remain descriptive. Only representable,
implemented mechanics participate in installability; unsupported mechanisms and
unmapped events must not silently acquire a command representation.

## Invariants

- Detection, support, and configuration remain distinct facts.
- Every managed native output belongs to one configured scope and identifiable
  desired capability.
- Adding or removing a target preserves unrelated native content. Removing
  membership retains MCP entries and Hook registrations, which may still execute.
  See [native declaration authority](managed-file-ownership.md#native-declaration-authority).
- Unsupported realization blocks the affected capability instead of silently
  weakening it.
- Removing an agent removes only outputs AXM can still prove it owns.
- Every support claim and default native path is derivable from the capability
  catalog; conditional location inputs remain explicit and captured.

## Testing strategy

Behavior tests prove detection and configuration independence, scope isolation,
capability reporting, add and remove reconciliation, unsupported targets,
unowned collisions, safe cleanup, and repeated execution.
