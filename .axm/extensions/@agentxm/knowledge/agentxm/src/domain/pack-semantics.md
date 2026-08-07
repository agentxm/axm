---
type: Domain Concept
description: Extension pack semantics — packs reference (never copy) leaf extensions, stay depth-1 by construction, resolve to pinned dependency maps, and uninstall orphan-aware.
tags: [packs, dependencies, resolution, composition]
status: stable
generated:
  by: claude/fable-5
  at: 2026-08-06T13:04:04Z
sources:
  - id: pack-schema
    resource: https://axm.sh/schemas/pack.schema.json
    title: Pack manifest JSON Schema
  - id: workspace-state
    resource: https://github.com/agentxm/axm/blob/main/contributing/guides/workspace-state.md
    title: AXM workspace-state guide (packs section)
---

# Extension pack semantics

`pack` is the extension type whose payload references other
extensions.[^pack-schema]

- A pack contains zero or more entries of
  `(handle, type, name, version range or pin)`.
- A pack entry **references** an extension; it does not copy extension
  identity.
- **Pack entries must target non-pack extension types only.** Packs may not
  include other packs, which keeps the pack graph at depth 1 by construction
  and eliminates cyclic-inclusion concerns entirely. A pack is a curated
  bundle of leaf extensions, not a hierarchy of meta-packs.
- Pack resolution materializes exact dependency maps keyed by FQN and pinned
  version (surfaced in the workspace lockfile as per-type maps such as
  `resolvedSkills`, `resolvedCommands`, and `resolvedMcpServers`; the lockfile
  schema owns the concrete field enumeration).
- Pack-managed dependency entries may exist as lockfile-only native installs,
  and therefore classify as _implicit_ until explicitly configured.
- Pack-driven uninstall removes only orphaned dependency entries — never
  directly configured entries, and never dependencies still referenced by
  other packs.

## Dependency invariants

- Pack manifests contribute desired members for all eight non-pack extension
  types; resolution maps are keyed by FQN and pinned version.[^workspace-state]
- Dependency removal during pack uninstall is orphan-aware across the
  remaining pack references.
- Directly configured entries are protected from pack-driven orphan cleanup.
- Receipt history (the lockfile) never creates or retains pack membership.

Related: [Extension types](extension-types.md),
[The AgentXM extension model](extension-model.md) for the
configured/implicit/unmanaged lifecycle classification packs participate in.

[^pack-schema]: Pack manifest JSON Schema.

[^workspace-state]: AXM workspace-state guide (packs section).
