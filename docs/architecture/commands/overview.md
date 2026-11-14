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

| Responsibility                 | Commands                                                                                                | Result                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Initialize a workspace         | `setup`                                                                                                 | An uninitialized scope receives explicit starting configuration.                                                 |
| Configure coding agents        | `agents add` and `agents remove`                                                                        | The durable target set and affected owned outputs change together.                                               |
| Configure instruction files    | `instructions`                                                                                          | Instruction-file management is inspected, enabled, or disabled explicitly.                                       |
| Assess a selected local scope  | `check` and typed `check`                                                                               | Bounded compatibility, ownership, lint, and convergence evidence with explicit coverage; no mutation.            |
| Diagnose invariant violations  | [`axm lint`](lint.md)                                                                                   | Facts about invalid extension or workspace state; bounded offline instruction-alias normalization under `--fix`. |
| Realize desired state          | [`axm sync`](sync.md)                                                                                   | Managed installed state and projections agree with desired state.                                                |
| Add extension configuration    | [`axm install`](install.md)                                                                             | The extension becomes directly desired and required managed state is realized.                                   |
| Change an installed resolution | [`axm update`](update.md)                                                                               | A resolution advances, a constraint changes, or accepted content is reinstalled.                                 |
| Remove extension configuration | [`axm uninstall`](uninstall.md)                                                                         | Direct reachability is removed; other desired routes remain.                                                     |
| Change activation              | `enable` and `disable`                                                                                  | Leaf projections or a Pack dependency route follow the desired activation.                                       |
| Change pack membership         | [`axm packs add` and `axm packs remove`](packs.md)                                                      | The authored pack manifest changes.                                                                              |
| Inspect extensions             | `list`, `list --outdated`, and `view`                                                                   | Inventory, update availability, or extension information; no state change.                                       |
| Discover extensions            | `discover`                                                                                              | Project packages produce recommendations without changing intent.                                                |
| Use type-specific capabilities | Type command groups                                                                                     | Knowledge retrieval, inline MCP configuration, and similar type-owned work.                                      |
| Author extensions              | [`new`, fork, Skill/Subagent import, adopt, demote, version, and type authoring commands](authoring.md) | Workspace-authored canonical content and explicit authority changes.                                             |
| Distribute authored extensions | [`publish`](publish.md)                                                                                 | Eligible authored content is validated and sent to the registry.                                                 |
| Migrate deprecated extensions  | `migrate`                                                                                               | Superseded extensions are replaced or obsolete entries removed from desired state.                               |
| Share repository installation  | `share`                                                                                                 | Repository install commands or package metadata are printed without changing content.                            |
| Manage published lifecycle     | `archive` / `unarchive`, `deprecate` / `undeprecate`, `yank` / `unyank`, and `visibility`               | Publisher-controlled Registry availability, guidance, or visibility changes.                                     |
| Authenticate Registry access   | `login`, `logout`, `whoami`, and `token`                                                                | Registry credentials and access-token records are managed explicitly.                                            |
| Inspect local operational data | `cache` and `diagnostics`                                                                               | Local caches and sanitized failure evidence are inspected or managed.                                            |
| Upgrade AXM                    | [`axm upgrade`](upgrade.md)                                                                             | The executable moves to a verified promoted or exact stable release.                                             |

## Non-responsibilities

No command is a fallback owner for work that lacks a clear home:

- lint does not choose a correction or perform general lifecycle and
  reconciliation work; `--fix` is the bounded instruction-alias normalization
  exception;
- sync does not edit workspace configuration or advance satisfying resolutions
  (the executable specification
  `cli/sync/preserves-configuration-and-resolutions` owns the obligation);
- lifecycle commands do not repair unrelated workspace state;
- type command groups do not define different lifecycle policy from root
  commands;
- setup does not reconstruct intent from observed files or become a repair
  workflow;
- inspection commands do not mutate the state they report; and
- upgrade does not discover stability from package-manager publication state;
  and
- a named override flag does not turn a command into a more general operation; the
  executable specification `cli/force-bypasses-only-named-policies`
  bounds what it may bypass.

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

Root `install`, `update`, `uninstall`, `enable`, `disable`, `list`, `show`, `check`, `view`, and `publish` are the
normal surface for fully qualified extension names and cross-type work. Type
command groups expose the same lifecycle behavior and add only capabilities
unique to that extension type, such as skill installation modes, inline MCP
configuration, Knowledge concept retrieval, or Pack membership editing.

`view` reads the Registry record by FQN. Root and typed `show` inspect explicit
local identities, paths, or all local subjects. `check` uses the same selection
semantics to assess those subjects and their required contributors.
`token show` and `diagnostics show` read non-extension records.

Cross-type authoring commands own shared conversion, authority, and version
behavior. Type command groups own type-specific scaffolding and may provide
type-specific conversion, but follow the shared
[authoring model](authoring.md). Creating an authored package is not an
implicit lifecycle operation.

`axm instructions` is a root workspace command family rather than an extension
type command. Rules and Knowledge may contribute to
the instruction surface, but none of those types owns the surface itself.

Root and type-specific forms express the same user intent and share planning
and machine-result semantics. A type command group must not develop different
lifecycle policy. [Extension architecture](../extensions/overview.md) owns the
semantic differences among types.

Skill and subagent install commands share registry-source probing, first-match
semantics, login suggestions, probe diagnostics, and error classification.
Their resolvers retain only genuine syntax and routing differences, such as
whether an SCP address is accepted. A new name-resolving install surface should
extend this shared policy instead of copying it into another command group.

## Shared lifecycle model

Install, update, uninstall, enable, and disable express durable workspace
choices and realize the selected extension together with the other extensions
connected in its semantic mutation closure. They preflight only that closure,
establish the whole promised postcondition atomically, and leave unrelated
invalid state alone.

The focused command documents own distinctions that are not evident from this
shared model. Exact flags, inputs, result fields, and supported extension types
remain executable contracts rather than prose inventory.

Agent identifiers follow their role: the verb's object is positional, workspace
membership and read-only inspection use repeatable `--agent`, and other
single-agent roles use a role-named flag. An agent subject never appears both
as a positional and `--agent`. The [targeting decision](../decisions/agent-targeting-is-workspace-membership.md)
explains these roles; executable specifications own their route allocation.

## Planning and interaction

Given the same state, preview must accurately describe what application will
do. Before writing, AXM checks that the relevant state has not changed; a stale
preview or plan writes nothing.

Every command declares what it can do without applying, which confirmation it
can approve in advance, and which trust conditions it can meet only
interactively; a command exposes `--preview` or `--yes` only when that
declaration gives the flag a purpose. [Interaction](interaction.md) owns the
contract. The binding override boundary is the executable specification
`cli/force-bypasses-only-named-policies` in the
[specification catalog](../../../specifications/catalog.md): it owns which
named policy an override may bypass and whether a command exposes
the flag at all. Override flags include `--reinstall`, `--accept-warnings`, and
`--ignore-release-age`; there is no bare `--force`. Routine exceptional modes receive their own names rather than
accumulating narrow override flags.

Global sync applies every ready independent closure. A nonzero result may still
include committed closures; human and machine output report each closure's
outcome rather than reducing the request to a misleading all-or-nothing label.

## Bounded assessment and operation verification

`check` composes local assessment owners over an explicit selection. It exposes
compatibility, ownership, lint, and convergence separately because they answer
different questions. Valid canonical content can coexist with missing generated
output: lint can pass while convergence requires reconciliation. An unreadable
output does not itself make an independently known contributor set unknown.

The selected scope expands through declared dependency and semantic ownership
relationships. A shared output needs all of its contributors, even when some are
outside a display filter. Sharing a physical file does not make independent
managed regions one semantic unit. Missing declarations or unresolved owners
remain incomplete evidence rather than proof of absence.

Coverage, findings, operation completion, and the assessment verdict are distinct.
A query can complete successfully as an execution while answering that the
selected state needs attention. Unrequested assessments establish nothing;
incomplete required evidence cannot establish a passing verdict. Human and
machine output project the same captured evidence without another observation.

The local check reads live filesystem state. It does not acquire packages,
refresh Registry credentials, repair, execute extension runtimes, or assess
remote availability. It is not a Git-index check or an atomic snapshot, and does
not authorize a later write. Existing workspace construction prerequisites still
apply. Help and version retain their independent prerequisites.

Mutation commands use their operation-specific preflight and postconditions.
They do not run every standalone assessment around every action. Authoring a
package does not require workspace convergence; an unrelated lint finding does
not become a lifecycle blocker. Remote-only operations retain their remote
settlement evidence and do not construct a workspace for synthetic postflight.
Specialized documents, credential delivery, and explicit runtime tests retain
their own result contracts.

Equivalent observations can be shared within a read-only phase. Mutation ends
that phase; postflight observes fresh state. Transaction-owned postcondition
validation remains inside the transaction, with its existing rollback contract.
Additional verification after commit cannot erase confirmed effects or imply
that rollback happened. Its failure reports retained effects and incomplete
verification through the operation's completion owner. A timeout after remote
dispatch remains indeterminate unless the protocol establishes settlement.

AXM still has no generic health verdict, workspace `prune`, or `repair` workflow.
Use `check` for a bounded local answer, lint for invariant findings, list for
inventory, sync preview for proposed reconciliation, and lifecycle commands for
configuration changes. The scoped cache operations remain distinct:
`cache status` reports usage, `cache verify` checks integrity and removes corrupt
archives, and `cache prune` applies retention policy.
