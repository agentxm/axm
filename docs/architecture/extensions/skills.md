---
status: stable
description: How AXM preserves portable Agent Skills content and realizes it for configured agents.
depends-on:
  - ./overview.md
  - ./targeting.md
---

# Skills

A Skill is portable instructional content authored to the Agent Skills
standard and made available through each configured agent's skill surface.

## Responsibilities

AXM validates the portable skill boundary, retains one canonical body, and
realizes that body in the locations configured agents expect. It may apply
deterministic capability-based enhancements while preserving a coherent
portable baseline.

The Skills command group may add source discovery, selection, and explicit
copy-for-authorship operations that are meaningful only for Agent Skills.
Those capabilities still use the shared lifecycle and ownership model.

## Non-responsibilities

AXM does not decide when a model invokes a skill, execute its instructions,
reinterpret opaque supporting files, or make an agent projection an authoring
source. It does not silently convert local edits to an externally sourced
skill into workspace authorship.

## State and realization

Workspace-authored skill content is editable canonical content. Canonical
content acquired from an external source is AXM-managed. Agent skill
directories are projections, whether a particular writer uses links or copies.
Formatting or incidental representation differences do not change that
authority boundary.

## Ownership and coexistence

One agent-facing Skill directory is the native ownership unit. Skill
directories with different names can coexist regardless of who installed them.
A desired Skill collides when its required name is occupied by a directory or
link AXM cannot prove it owns.

AXM may restore or remove only a directory traceable to its canonical Skill.
This must remain true for both linked and copied projections; a matching name or
matching files are not sufficient ownership evidence. The Agent Skills format
defines the directory and its name, not which installer owns it.

## Invariants

- The portable Agent Skills body remains usable without targeted enhancements.
- Identity agrees across workspace configuration, the manifest, the skill
  body, and agent-facing placement.
- Reconciliation never adopts or overwrites an unowned agent-side skill.
- A copied projection does not become authoritative when it is edited.
- Required coupling to another extension is explicit pack composition, not a
  hidden skill dependency.

## Testing strategy

Behavior tests prove standard validation, source selection, deterministic
cross-agent realization, capability enhancement, independent foreign Skills,
same-name collisions, ambiguous copied projections, linked ownership,
external-content drift, disable and re-enable, safe removal, and idempotent
reconciliation.
