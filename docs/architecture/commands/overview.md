---
type: Architecture
status: stable
description: Command responsibilities, lifecycle symmetry, interaction, and recovery boundaries for AXM.
depends-on:
  - ../principles.md
  - ../workspace/overview.md
  - ../workspace/invariants.md
---

# Commands

AXM commands divide work by responsibility. Diagnostics explain state,
authoring commands create canonical content, lifecycle commands express user
intent by changing workspace configuration, sync realizes desired state, and
publishing distributes authored extensions. Keeping those jobs distinct makes
the CLI easier to predict and invalid workspaces easier to recover.

## Responsibilities

| Responsibility                 | Commands                                                                                                | Result                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Initialize a workspace         | `setup`                                                                                                 | An uninitialized scope receives explicit starting configuration.                 |
| Configure coding agents        | `agents add` and `agents remove`                                                                        | The durable target set and affected owned outputs change together.               |
| Configure instruction files    | `instructions`                                                                                          | Instruction-file management is inspected, enabled, or disabled explicitly.       |
| Diagnose invariant violations  | [`axm lint`](lint.md)                                                                                   | Facts about invalid extension or workspace state; no state change.               |
| Realize desired state          | [`axm sync`](sync.md)                                                                                   | Managed installed state and projections agree with desired state.                |
| Add extension configuration    | [`axm install`](install.md)                                                                             | The extension becomes directly desired and required managed state is realized.   |
| Change an installed resolution | [`axm update`](update.md)                                                                               | A resolution advances, a constraint changes, or accepted content is reinstalled. |
| Remove extension configuration | [`axm uninstall`](uninstall.md)                                                                         | Direct reachability is removed; other desired routes remain.                     |
| Change activation              | `enable` and `disable`                                                                                  | Leaf projections or a Pack dependency route follow the desired activation.       |
| Change pack membership         | [`axm packs add` and `axm packs remove`](packs.md)                                                      | The authored pack manifest changes.                                              |
| Inspect extensions             | `list`, `list --outdated`, and `view`                                                                   | Inventory, update availability, or extension information; no state change.       |
| Discover extensions            | `discover`                                                                                              | Project packages produce recommendations without changing intent.                |
| Use type-specific capabilities | Type command groups                                                                                     | Knowledge retrieval, inline MCP configuration, and similar type-owned work.      |
| Author extensions              | [`new`, fork, Skill/Subagent import, adopt, demote, version, and type authoring commands](authoring.md) | Workspace-authored canonical content and explicit authority changes.             |
| Distribute authored extensions | [`publish`](publish.md)                                                                                 | Eligible authored content is validated and sent to the registry.                 |

## Non-responsibilities

No command is a fallback owner for work that lacks a clear home:

- lint does not choose a correction or perform lifecycle and reconciliation
  work;
- sync does not edit workspace configuration or advance satisfying
  resolutions
  ([AXM-REQ-0012](../../../gen-stack/system/requirements/functional/reconciliation-preserves-configuration.md)
  is canonical);
- lifecycle commands do not repair unrelated workspace state;
- type command groups do not define different lifecycle policy from root
  commands;
- setup does not reconstruct intent from observed files or become a repair
  workflow;
- inspection commands do not mutate the state they report; and
- `--force` does not turn a command into a more general operation;
  [AXM-REQ-0007](../../../gen-stack/architecture/surfaces/cli/requirements/constraint/force-bypasses-only-forceable-policies.md)
  canonically bounds what it may bypass.

Every command whose semantics require a project workspace first passes the
shared project-and-user settings construction prerequisite. Command-specific
inspection, planning, closure preflight, independent progress, and mutation
rules apply only after that gate succeeds. Version and help encounters remain
outside the gate, and no workspace command becomes a settings-repair owner.

When an action does not fit a command's responsibility, AXM changes the design
or leaves the decision to the user; it does not hide the action behind an
override.

After workspace construction succeeds, lifecycle commands check only the
invariants needed for the selected extension and the other extensions that must
change with it. Unrelated broken extensions do not prevent a valid scoped
change.

## Root commands and type command groups

Root `install`, `update`, `uninstall`, `list`, `view`, and `publish` are the
normal surface for fully qualified extension names and cross-type work. Type
command groups expose the same lifecycle behavior and add only capabilities
unique to that extension type, such as skill installation modes, inline MCP
configuration, Knowledge concept retrieval, or Pack membership editing.

Cross-type authoring commands own shared conversion, authority, and version
behavior. Type command groups own type-specific scaffolding and may provide
type-specific conversion, but follow the shared
[authoring model](authoring.md). Creating an authored package is not an
implicit lifecycle operation.

`axm instructions` is a root workspace command family rather than an extension
type command. Rules, Knowledge, and supported Hook fallbacks may contribute to
the instruction surface, but none of those types owns the surface itself.

Root and type-specific forms express the same user intent and share planning
and machine-result semantics. A type command group must not develop different
lifecycle policy. [Extension architecture](../extensions/overview.md) owns the
semantic differences among types.

## Shared lifecycle model

Install, update, uninstall, enable, and disable express durable workspace
choices and realize the selected extension together with the other extensions
connected in its semantic mutation closure. They preflight only that closure,
establish the whole promised postcondition atomically, and leave unrelated
invalid state alone.

The focused command documents own distinctions that are not evident from this
shared model. Exact flags, inputs, result fields, and supported extension types
remain executable contracts rather than prose inventory.

## Planning and interaction

Given the same state, preview must accurately describe what application will
do. Before writing, AXM checks that the relevant state has not changed; a stale
preview or plan writes nothing.

`--yes` answers routine prompts. The canonical force boundary is
[AXM-REQ-0007](../../../gen-stack/architecture/surfaces/cli/requirements/constraint/force-bypasses-only-forceable-policies.md):
it owns which explicitly forceable policy `--force` may bypass and whether a
command exposes the flag at all. Routine exceptional modes receive their own
names rather than accumulating narrow override flags.

Global sync applies every ready independent closure. A nonzero result may still
include committed closures; human and machine output report each closure's
outcome rather than reducing the request to a misleading all-or-nothing label.

## No generic health or repair command

AXM does not need a generic `status`, workspace `prune`, or `repair` workflow.
Use lint for invariant facts, list for inventory, sync preview for proposed
reconciliation, and lifecycle commands for configuration changes. Focused
cache pruning remains a separate housekeeping operation.
