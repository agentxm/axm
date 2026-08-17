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

## Invariants

- Detection, support, and configuration remain distinct facts.
- Every managed native output belongs to one configured scope and identifiable
  desired capability.
- Adding or removing a target preserves unowned native content.
- Unsupported realization blocks the affected capability instead of silently
  weakening it.
- Removing an agent removes only outputs AXM can still prove it owns.

## Testing strategy

Behavior tests prove detection and configuration independence, scope isolation,
capability reporting, add and remove reconciliation, unsupported targets,
unowned collisions, safe cleanup, and repeated execution.
