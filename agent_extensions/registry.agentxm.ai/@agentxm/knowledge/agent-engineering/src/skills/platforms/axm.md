---
type: Reference
title: AXM extension-management profile
description:
  How AXM manages canonical packages, projections, composition, workspace state,
  validation, distribution, and lifecycle across agent extension types.
tags:
  [
    agent-extensions,
    agent-skills,
    axm,
    packaging,
    projections,
    packs,
    lifecycle,
  ]
status: stable
stale_after: 2027-02-22
generated: { by: "codex/gpt-6", at: 2026-10-01T03:12:00Z }
sources:
  - id: axm-skills-architecture
    resource: https://github.com/agentxm/axm/blob/main/docs/architecture/extensions/skills.md
    title: AXM — Skills architecture
  - id: axm-skills-help
    resource: https://github.com/agentxm/axm/blob/main/apps/cli/help/topics/skills.md
    title: AXM CLI — Skills help
  - id: axm-packs-help
    resource: https://github.com/agentxm/axm/blob/main/apps/cli/help/topics/packs.md
    title: AXM CLI — Packs help
  - id: axm-workspace-state-help
    resource: https://github.com/agentxm/axm/blob/main/apps/cli/help/topics/workspace-state.md
    title: AXM CLI — Workspace state help
  - id: axm-package-extensions-help
    resource: https://github.com/agentxm/axm/blob/main/apps/cli/help/topics/package-extensions.md
    title: AXM CLI — Package extensions help
  - id: axm-agent-catalog
    resource: https://github.com/agentxm/axm/blob/main/packages/core/extension-model/src/unstable/agent-capabilities/data/agents/README.md
    title: AXM — Agent Capability Catalog
---

# AXM extension-management profile

AXM is an extension manager and distribution layer, not an agent host. Apply
this profile whenever AXM owns a package, alongside the portable contract for
the extension type and the profile for every host the extension supports.

## Managed extension model

AXM manages skills, subagents, MCP servers, rules, hooks, Knowledge bundles, and
packs. Project-authored packages stay canonical in type roots such as
`skills/<name>/` and `knowledge/<name>/`; acquired packages stay canonical under
`agent_extensions/<source-family>/<@owner>/<plural-type>/<name>/`, where the
source family is `registry`, `git`, or `path`.[^axm-workspace-state-help]
Agent-native files and config are projections, not authoring
sources.[^axm-skills-architecture] A skill combines portable `src/SKILL.md`
content with `skill.json` distribution metadata, while the other types use their
own portable payload and manifest contracts.[^axm-skills-help]

Keep these state families distinct:[^axm-workspace-state-help]

| State               | Authority                                                               |
| ------------------- | ----------------------------------------------------------------------- |
| Desired             | `axm.json` and workspace-authored pack manifests                        |
| Accepted resolution | Immutable external identities in `axm-lock.yaml`                        |
| Observed            | Canonical packages, projections, managed regions, and ownership markers |

Use AXM commands or desired-state sources to change intent. Use `axm lint` for
read-only facts and `axm sync --preview` before reconciliation. Never
reconstruct intent from a lock row, hand-edit an agent projection, treat a
copied native file as canonical, or edit acquired package bytes. Fork an
acquired package before customization.

## Agent capability and delivery claims

The
[Agent Capability Catalog](https://github.com/agentxm/axm/blob/main/packages/core/extension-model/src/unstable/agent-capabilities/data/agents/README.md)
owns current product identities, scoped lifecycle qualifications, native
readers, and AXM integration mechanics. Use its released reference for current
availability instead of copying a support matrix into this profile.

Keep native availability, AXM integration, and installation conditions visible
as separate judgments. Native capability can be documented while its grammar is
unmodeled or AXM has no writer. Hosted delivery can require manual action.
Conditional support retains its edition, scope, version, trust, and
configuration requirements; it is not unconditional compatibility.

Catalog source reviews and AXM execution evidence also have separate dates.
Configuration verification establishes the exercised projection boundary;
vendor-runtime verification establishes only the recorded host behavior. A
historical verification date without a recorded method establishes neither.
Follow [Portability and compatibility](../portability-and-compatibility.md) when
deciding what an extension may claim.[^axm-agent-catalog]

## Composition and package relationships

Keep an extension self-contained unless required coupling is declared through
one pack. Every required sibling must be a direct member of that pack; the
referencing extension must be non-standalone, recommend the pack, and reach the
sibling by extension identity or name through the host's or manager's own
discovery rather than by any path into another extension's files. Pack install,
update, enable, disable, uninstall, and unpack apply to the complete member
graph atomically.[^axm-packs-help]

An active catalog or observed cohort records what happened to coexist during a
run; it is not relationship authority. A co-installed extension can be a useful
routing neighbor or collision case without becoming a dependency, required
collaborator, or remediation target. Infer required composition only from the
declared package relationship above, and attribute a catalog-level collision to
the smallest surface that owns it rather than rewriting an unrelated package to
depend on an incidental neighbor.

`recommendedPacks` is discovery metadata, not an installation guarantee. A
host-native agent plugin is not an AXM extension type and is not interchangeable
with an AXM pack. Link ecosystem or plugin packages to extensions through AXM's
companion-package and recommended-extension metadata; when several extensions
belong together, recommend one pack rather than parallel
entries.[^axm-package-extensions-help]

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
extension may be invoked. Do not translate `deprecated`, `revoked`, or `retired`
into one guessed command.

## Authoring and verification

Use the CLI's current help before mutations, preview changes, lint the
workspace, review generated state, use `axm packs show` for composition, and
verify package integrity before publishing. Keep portable behavior in the
extension payload and AXM distribution metadata in the manifest. An
extension-root `.gitignore` protects consumer worktrees; `publish.include` and
`publish.exclude` select only the Registry archive. Before publishing, verify
that the preview retains required dotfiles, excludes generated residue, and
leaves canonical and projected state clean. AXM behavior is versioned; resolve
current command and schema behavior from the installed release. The 2026-10-01
source review updated canonical source families and capability-evidence
boundaries; it did not execute the lifecycle operations described here or verify
agent runtimes.

[^axm-skills-architecture]: AXM — Skills architecture

[^axm-skills-help]: AXM CLI — Skills help

[^axm-packs-help]: AXM CLI — Packs help

[^axm-workspace-state-help]: AXM CLI — Workspace state help

[^axm-package-extensions-help]: AXM CLI — Package extensions help

[^axm-agent-catalog]: AXM — Agent Capability Catalog
