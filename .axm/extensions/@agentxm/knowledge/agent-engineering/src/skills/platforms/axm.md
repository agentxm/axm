---
type: Reference
title: AXM extension-management profile
description: How AXM manages canonical packages, projections, composition, workspace state, validation, distribution, and lifecycle across agent extension types.
tags: [agent-extensions, agent-skills, axm, packaging, projections, packs, lifecycle]
status: stable
stale_after: 2027-02-22
generated: { by: "codex/gpt-5.6", at: 2026-08-22T15:54:57Z }
sources:
  - id: axm-skills-architecture
    resource: https://github.com/agentxm/axm/blob/main/docs/architecture/extensions/skills.md
    title: AXM — Skills architecture
  - id: axm-skills-help
    resource: https://github.com/agentxm/axm/blob/main/packages/cli/help/topics/skills.md
    title: AXM CLI — Skills help
  - id: axm-packs-help
    resource: https://github.com/agentxm/axm/blob/main/packages/cli/help/topics/packs.md
    title: AXM CLI — Packs help
  - id: axm-workspace-state-help
    resource: https://github.com/agentxm/axm/blob/main/packages/cli/help/topics/workspace-state.md
    title: AXM CLI — Workspace state help
  - id: axm-package-extensions-help
    resource: https://github.com/agentxm/axm/blob/main/packages/cli/help/topics/package-extensions.md
    title: AXM CLI — Package extensions help
---

# AXM extension-management profile

AXM is an extension manager and distribution layer, not an agent host. Apply
this profile whenever AXM owns a package, alongside the portable contract for
the extension type and the profile for every host the extension supports.

## Managed extension model

AXM manages skills, subagents, MCP servers, rules, hooks, Knowledge bundles, and
packs. Each authored package stays canonical under
`.axm/extensions/<owner>/<plural-type>/<name>/`; agent-native files and config
are projections, not authoring sources.[^axm-skills-architecture] A skill
combines portable `src/SKILL.md` content with `skill.json` distribution
metadata, while the other types use their own portable payload and manifest
contracts.[^axm-skills-help]

Keep these state families distinct:[^axm-workspace-state-help]

| State               | Authority                                                               |
| ------------------- | ----------------------------------------------------------------------- |
| Desired             | `.axm/settings.json` and workspace-authored pack manifests              |
| Accepted resolution | Immutable external identities in `.axm/axm-lock.yaml`                   |
| Observed            | Canonical packages, projections, managed regions, and ownership markers |

Use AXM commands or desired-state sources to change intent. Use `axm lint` for
read-only facts and `axm sync --preview` before reconciliation. Never reconstruct
intent from a lock row, hand-edit an agent projection, or treat a copied native
file as canonical.

## Composition and package relationships

Keep an extension self-contained unless required coupling is declared through
one pack. Every required sibling must be a direct member of that pack; the
referencing extension must be non-standalone, recommend the pack, and use the
canonical same-pack path. Pack install, update, enable, disable, uninstall, and
unpack apply to the complete member graph atomically.[^axm-packs-help]

`recommendedPacks` is discovery metadata, not an installation guarantee. A
host-native agent plugin is not an AXM extension type and is not interchangeable
with an AXM pack. Link ecosystem or plugin packages to extensions through AXM's
companion-package and recommended-extension metadata; when several extensions
belong together, recommend one pack rather than parallel entries.[^axm-package-extensions-help]

## Lifecycle controls

Governance states and AXM operations answer different questions. A governance
decision can require several AXM actions:

| Intent                                            | AXM control             |
| ------------------------------------------------- | ----------------------- |
| Record migration guidance                         | `axm deprecate`         |
| Exclude one or all versions from fresh resolution | `axm yank`              |
| Retain an installed extension but deactivate it   | Type-specific `disable` |
| Remove an extension from one workspace            | `axm uninstall`         |
| Change an authored package version                | `axm version`           |
| Reconcile accepted intent and owned projections   | `axm sync`              |

Deprecation is warning-only: it does not block fresh resolution or deactivate
existing installations. Yanking changes fresh resolution without deleting the
published identity. Disabling preserves managed canonical and resolution state;
uninstalling removes only state no remaining direct or pack origin requires.
Treat AXM's desired and listed `enabled` state as activation authority; retained
canonical source or a surviving projection is not evidence that a disabled
extension may be invoked. Do not translate `deprecated`, `revoked`, or
`retired` into one guessed command.

## Authoring and verification

Use the CLI's current help before mutations, preview changes, lint the workspace,
review generated state, use `axm packs show` for composition, and verify package
integrity before publishing. Keep portable behavior in the extension payload and
AXM distribution metadata in the manifest. AXM behavior is versioned; this
profile was checked against AXM 0.27.15 and must be refreshed against the
current CLI and schemas after its `stale_after` date.

[^axm-skills-architecture]: AXM — Skills architecture

[^axm-skills-help]: AXM CLI — Skills help

[^axm-packs-help]: AXM CLI — Packs help

[^axm-workspace-state-help]: AXM CLI — Workspace state help

[^axm-package-extensions-help]: AXM CLI — Package extensions help
