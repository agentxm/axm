---
name: axm
description: >-
  Manages AXM packages, workspace state, projections, composition,
  distribution, and lifecycle. Use for
  discover, find, inspect, create, scaffold, import, fork, adopt, install, add,
  configure, edit, update, upgrade, enable, disable, sync, lint, validate,
  package, bundle, version, publish, archive, unarchive, deprecate, yank,
  uninstall, remove, or
  delete of skills or SKILL.md; subagents or agent definitions; MCP
  server configurations or connections; rules or instructions; hooks;
  Knowledge bundles; or packs—even when AXM is not named. Activate before
  changing managed content to resolve source and ownership. Workspace setup
  and projection-only repair are
  AXM state work, not instruction authoring; agent definitions are not Agent
  Skills. For audit-and-fix, order audit, AXM state, authoring, then audit
  verification. Not for implementing or debugging MCP server software; in
  mixed requests, software owns it and AXM owns connection configuration. Not
  for merely using an installed extension.
license: FSL-1.1-MIT; https://github.com/agentxm/axm/blob/main/LICENSE
metadata:
  axm.sh/cli-version: "0.51.0"
  axm.sh/cli-version-range: ">=0.51.0 <0.52.0"
---

# AXM

Use AXM to discover and manage agent extensions. Keep package and workspace
operations separate from the semantic work the extension performs.

Use the shared meanings in [Agent Extension Glossary](references/glossary.md)
when interpreting or explaining extension concepts. Consult the relevant entries
when terminology affects classification or action. The same glossary is available
offline through `axm help glossary`; the engineering pack is not required.

## Choose the task

- For explanation or capability discovery, use `axm help` and the narrowest
  `axm help <topic>` or `axm <command> --help`. Help works without a workspace,
  authentication, or network. Do not run workspace preflight for an explanation.
- For creation or changes, identify the extension type, operation, project or
  user scope, and canonical owner before editing. AXM owns scaffolding, package
  identity, installation, composition, projections, distribution, and lifecycle.
- For review, use the requested assessment workflow. Inspect AXM state only
  when package ownership or workspace behavior is part of the question.
- MCP connection configuration belongs here; implementing or debugging MCP
  server software belongs to the software workflow. Merely using an installed
  extension needs no AXM management action.

## Orient before an operation

Check that `axm` is available and read the live help for the selected command.
If it is unavailable, stop AXM mutations and report the installation prerequisite;
do not reconstruct managed state by hand. The installed CLI owns current flags,
output fields, and recovery commands.

For workspace operations, resolve the exact identity and canonical path from
local settings and AXM inspection before network discovery. Before changing an
existing workspace, run `axm lint --json` (with the selected scope) and inspect
`result.axmSkillCompatibility`. Follow its reported recovery and `axm help
upgrade` if incompatible; never edit release-owned compatibility stamps. A
missing compatibility field means the official skill was not declared. Read-only
inspection needs lint only when health or compatibility affects its answer.

`axm.json` owns desired settings; `axm.lock` owns accepted external resolution.
Authored roots and retained packages own content; agent-native files are
projections. Resolve acquired paths through AXM rather than constructing them.
Never edit projections or hand-edit the lockfile. Preserve local drift and
unknown content until ownership is resolved. Missing local authority is not
repaired by a Registry lookup. See `axm help workspace-state` for layouts,
source boundaries, and recovery.

Treat explicitly supplied resolution, result, and workspace facts as the case's
evidence in a read-only plan. Do not replace them with incidental state from a
different workspace. Read-only requests do not authorize apply commands.

## Author with a complete core

After resolving ownership, use `axm help authoring`, the type topic (for example
`axm help skills`), and its schema help to scaffold or edit the canonical package.
Write the requested content against the user's purpose and constraints, then
validate and exercise a representative use. This basic authoring path does not
require another skill.

For deeper design, review, or pattern guidance, recommend the optional
`@agentxm/packs/agent-extension-engineering` collection where useful. If installed,
route semantic work to `@agentxm/skills/agent-extension-engineering`, which selects
its knowledge concepts. Resolve it by identity through host discovery. If absent,
continue with core guidance; do not silently install it or block ordinary work.
Specialized authoring or audit workflows remain useful when available and relevant.

## Keep authority bounded

Stay within the user's selected scope and operation. A plan or review is
read-only. Inspect a preview for destructive, bulk, ambiguous, or source-changing
work; refresh it if desired state, accepted resolution, or candidate bytes change.
An unowned-file collision blocks the affected closure until ownership is resolved.

Use symbolic secret references. If the user supplies a literal credential, never
repeat it in commands, files, reports, or telemetry. Do not authenticate for
public reads or installs unless a live result requires it. Never send credentials
to an undeclared Registry: resolve its identity and trust before retrying.

Publication, Registry lifecycle changes, credentials, and executable upgrades
require authority for that operation and target. `axm upgrade` changes the
installed executable; it is separate from workspace repair. Do not broaden a
selected mutation into bulk publication or cleanup. A failed Registry mutation
requires its live result and help to establish safe recovery before retrying.

## Read conditional guidance

| Task                                                             | Guidance                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| Publish, inspect archive selection, or change Registry lifecycle | [Publishing](references/publishing.md) and `axm help publish`    |
| Create, change, render, or import subagents                      | [Subagents](references/subagents.md)                             |
| Configure MCP connections or native hooks                        | [MCP connections and hooks](references/connections-and-hooks.md) |
| Diagnose workspace health or use `doctor`                        | [Diagnosis](references/doctor.md)                                |

These references refine the selected task; they grant no additional authority.

## Verify and report the result

Read the actual result: failed, partial, refused, stale, or rolled-back work is
not success. Verify only the state families the operation changes: canonical
content, desired selection, accepted resolution, projections, and Registry state.
After workspace changes, run scoped `axm lint --json`; when projection convergence
matters, also run `axm sync --preview --fail-on-change --json`.

For MCP connection work, select the intended agents and verify each one's
projection capability and resulting connection state. For Registry changes,
preflight the complete selected candidates, mutate only the authorized identities
and versions, then read back those exact versions. Carry those checks into a
blocked or read-only plan without executing them.

Report the result and meaningful verification, identifying scope and canonical
source where they matter. For incomplete work, preserve the actual blocker and
name the bounded next action and post-apply checks. An explanation or simple
review does not need an operational report.
