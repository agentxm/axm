# Workspaces

The shared product model defines a workspace as a local scope in which AXM
manages extensions. This document defines AXM's architecture within that
boundary.

An AXM workspace records explicit user choices and contains the state needed to
realize the resulting desired state across coding agents. Reliability depends
on keeping user intent, workspace configuration, desired state, and current
state distinct.

## Responsibilities

The workspace model owns:

- the separation of configuration, desired state, and current state;
- authority and ownership for canonical packages and agent outputs;
- reachability and retention across direct and dependency routes;
- the relationship between resolutions, trust, content, and projections; and
- safety boundaries for changes within one workspace scope.

## Non-responsibilities

The workspace model does not own:

- shared AgentXM product definitions, which come from the AgentXM Knowledge
  bundle;
- the fields and editing rules of `settings.json`, which belong to
  [Workspace settings](settings.md);
- lockfile contents and regeneration rules, which belong to the
  [Lockfile](lockfile.md);
- which command expresses an action, which belongs to
  [Commands](commands.md);
- diagnostic and reconciliation behavior, which belong to [Lint](lint.md) and
  [Sync](sync.md); or
- agent-specific serialization mechanics, which belong to adapters and their
  tests.

## From user intent to desired state

User intent is the outcome the user means to achieve. AXM cannot know unstated
intent; it acts on choices the user expresses through commands or direct edits.

Workspace configuration records those durable choices: directly requested
extensions, version constraints, agents, activation, and workspace-authored
manifests. The [workspace settings design](settings.md) owns the
`.axm/settings.json` boundary. AXM combines that configuration with trusted
extension metadata to derive the complete desired state, including pack members
and transitive dependencies.

The lockfile, installed files, and agent outputs describe or realize current
state. They do not create desired state on their own.

## Workspace state

| State                   | Role                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| Workspace configuration | Records the user's explicit, durable choices in [settings](settings.md). |
| Desired state           | Describes the complete extension and activation target derived by AXM.   |
| Lockfile                | Records exact selected resolutions; see [Lockfile](lockfile.md).         |
| Canonical packages      | Hold the package content from which agent projections are produced.      |
| Trust records           | Record the source identity accepted for acquired external content.       |
| Projections             | Present canonical content in each agent's expected location and format.  |
| Unmanaged content       | Belongs to the user or another tool and remains outside AXM ownership.   |

Workspace configuration answers which explicit choices the user has made.
Desired state expands those choices through dependency relationships. Locked
resolutions and existing files do not make an extension desired.

## Canonical package ownership

Canonical content has one of three authorities:

- **Workspace-authored:** The workspace is the source. AXM never overwrites or
  deletes it as an incidental lifecycle or recovery action.
- **External:** AXM installed a copy from a registry or other supported source.
  The extension remains AXM-managed even if its local bytes change, but ordinary
  sync does not overwrite that drift.
- **Bundled:** The running AXM distribution supplies and controls the content.

Changing an extension between workspace and external authority is an explicit
operation. Installation history, a trust record, or a recommended pack does
not silently change authority.

## Reachability and retention

An extension is retained when it is reachable from desired state. Direct
extension configuration, pack membership, and transitive pack dependencies can
make an extension reachable. A locked resolution does not keep an otherwise
undesired extension installed.

Removing one route to an extension does not remove it while another desired route
still reaches it. Cleanup that depends on knowing the complete dependency graph
waits until that graph can be resolved completely.

Registry packs depend on registry extension identities and version constraints.
A local copy of a registry pack contributes dependency meaning only when its
manifest matches the trusted registry manifest. Workspace-authored pack
manifests are workspace configuration and may be edited directly.

## Locked resolutions and trust

A locked resolution that satisfies desired state pins the exact selected
version and source. Missing external canonical content can be reacquired at
that resolution. Updating, not syncing, owns advancing it.

Trust records the external source identity accepted at acquisition. It does
not make later local byte drift a standing security violation. Replacing
divergent external content during an explicit update or reinstall must be
disclosed.

## Projections and unmanaged content

Projections are derived, AXM-owned outputs. Every agent adapter follows the same
four rules:

- Create a missing AXM-owned projection.
- Restore a stale AXM-owned projection.
- Remove an obsolete AXM-owned projection.
- Block on an unowned collision and never overwrite it.

Unmanaged skills and other agent content are valid workspace content. AXM may
report a collision when unmanaged content occupies a required projection path,
but it does not adopt, rewrite, or remove that content implicitly.

## Safe workspace changes

Two AXM changes to the same workspace scope must not interleave. Immediately
before writing, AXM checks that the inputs and targets still match the proposed
change. If they do not, it writes nothing.

Workspace configuration, trust, the lockfile, canonical content, and projections
change as one unit for extensions that must change together. A handled failure,
including a lockfile write failure, leaves that work unchanged.

Abrupt termination must not leave a partly written authoritative file or lose
authored or unmanaged content. A later run can safely finish from the remaining
authoritative state.
---

status: stable
description: The relationship among user intent, desired state, current state, ownership, and safe workspace changes.
---
