# Commands

AXM commands divide work by responsibility. Diagnostics explain state,
lifecycle commands express user intent by changing workspace configuration,
sync realizes desired state, and publishing distributes authored extensions.
Keeping those jobs distinct makes the CLI easier to predict and invalid
workspaces easier to recover.

## Responsibilities

| Responsibility                 | Commands                               | Result                                                                           |
| ------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------- |
| Diagnose invariant violations  | `axm lint`                             | Facts about invalid extension or workspace state; no state change.               |
| Normalize safe source details  | `axm lint --fix`                       | Meaning-preserving edits only.                                                   |
| Realize desired state          | `axm sync`                             | Managed installed state and projections agree with desired state.                |
| Add extension configuration    | `axm install`                          | The selected extension is directly desired and its dependency group is realized. |
| Advance a locked resolution    | `axm update`                           | An existing constraint is resolved to an allowed newer version.                  |
| Reinstall a locked resolution  | `axm update --reinstall`               | External content is reacquired without advancing the resolution.                 |
| Remove extension configuration | `axm uninstall`                        | Direct reachability is removed; other desired routes remain.                     |
| Change activation              | `enable` and `disable`                 | Desired activation changes and affected projections follow it.                   |
| Change pack membership         | `axm packs add` and `axm packs remove` | The authored pack manifest changes.                                              |
| Inspect extensions             | `list` and `view`                      | Inventory or extension information; no state change.                             |
| Distribute authored extensions | `publish`                              | Eligible authored content is sent to the registry.                               |

## Non-responsibilities

No command is a fallback owner for work that lacks a clear home:

- lint does not choose a correction or perform lifecycle and reconciliation
  work;
- sync does not edit workspace configuration or advance satisfying
  resolutions;
- lifecycle commands do not repair unrelated workspace state;
- type namespaces do not define different lifecycle policy from root commands;
- inspection commands do not mutate the state they report; and
- `--force` does not turn a command into a more general operation or bypass
  hard invariants.

When an action does not fit a command's responsibility, AXM changes the design
or leaves the decision to the user; it does not hide the action behind an
override.

Lifecycle commands check only the invariants needed for the selected extension
and the dependencies that must change with it. Unrelated broken extensions do not
prevent a valid scoped change.

## Root commands and namespaces

Root `install`, `update`, `uninstall`, `list`, `view`, and `publish` are the
normal surface for fully qualified extension names and cross-type work. Type
namespaces expose the same lifecycle behavior and add only capabilities unique
to that extension type, such as skill installation modes or pack membership
editing.

Root and namespaced forms express the same user intent and share planning
behavior. A type namespace must not develop different lifecycle policy.

## Lifecycle commands and configuration

Installing an already desired extension is a successful no-op unless the caller
explicitly supplies a different constraint. Supplying a constraint authorizes
changing that constraint.

Updating without a new constraint advances the locked resolution within the
existing workspace configuration. Updating with a constraint changes workspace
configuration and realizes the affected set of extensions as one change.
Reinstalling rematerializes the locked resolution and discloses replacement of
divergent external content.

Uninstalling removes direct reachability. If a pack or another desired extension
still reaches the target, AXM keeps it and explains why.

Pack add and remove edit workspace configuration only. Pack dependencies use
fully qualified registry names with explicit version constraints. Adding an
already configured dependency with a new constraint updates that configuration;
it does not need a replacement override. Empty authored packs are valid
locally, while the publish gate may reject them for distribution.

## Planning and interaction

Given the same state, preview must accurately describe what application will
do. Before writing, AXM checks that the relevant state has not changed; a stale
preview or plan writes nothing.

`--yes` answers routine prompts. `--force` may bypass only an explicitly
forceable policy and never a hard invariant. Routine exceptional modes receive
their own names rather than accumulating narrow override flags.

## No generic health or repair command

AXM does not need a generic `status`, workspace `prune`, or `repair` workflow.
Use lint for invariant facts, list for inventory, sync preview for proposed
reconciliation, and lifecycle commands for configuration changes. Focused
cache pruning remains a separate housekeeping operation.
---

status: stable
description: Command responsibilities, lifecycle symmetry, interaction, and recovery boundaries for AXM.
---
