# Lockfile

`.axm/axm-lock.yaml` is AXM's generated, committed snapshot of the exact
resolutions selected for desired extensions. It makes workspace configuration
repeatable without turning previously installed files into user intent.

The lockfile is authoritative for a selected resolution only while that
resolution still satisfies desired state. Settings and authored manifests own
what is desired; trust state owns which external identity has been accepted;
the filesystem owns what is currently present.

## Responsibilities

For each resolved desired extension, the lockfile records the exact information
needed to identify and reacquire the selected package. That includes the
selected version or immutable revision, its source, and integrity or dependency
information required to reproduce the resolution.

The snapshot covers extensions reached directly and through packs or transitive
dependencies. The route that makes an extension desired remains outside the
lockfile so a stale row cannot retain an otherwise undesired extension.

A lock entry describes a resolution, not an event. The lockfile contains no
command history, success log, or installation timeline. Data that cannot help
reproduce or verify the selected state does not belong in it.

## Non-responsibilities

The lockfile records a selected resolution; it does not decide what the
workspace wants or describe everything currently present.

| The lockfile does not own                                     | Owner                                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| Direct user choices and version constraints                   | Settings and workspace-authored manifests                         |
| Desired-state reachability and dependency routes              | Desired-state derivation                                          |
| Accepted source identity and authority transitions            | Trust state and explicit lifecycle operations                     |
| Current package or projection presence and drift              | Observed filesystem and agent state                               |
| Ownership of canonical or agent-facing paths                  | Authorship, trust, and AXM ownership evidence                     |
| The decision to advance or reinstall a resolution             | Update or reinstall intent                                        |
| Command execution, installation history, or prior resolutions | No lockfile responsibility; operational evidence stays outside it |

A row without a route from desired state is stale resolution data. It does not
declare, retain, install, trust, or take ownership of an extension.

## Resolution behavior

A satisfying locked resolution is stable:

- sync reuses it rather than looking for a newer version;
- missing external package content may be reacquired at that exact resolution;
- update may advance it within the configured constraint; and
- reinstall may replace package content at the same resolution.

When configuration changes so the locked resolution no longer satisfies
desired state, the next lifecycle or sync plan resolves a new valid result. A
lockfile change never silently broadens the constraint recorded in settings.

Trust remains a separate authority. Source and integrity details in the
lockfile support reproduction and verification, but copying or editing them
does not establish trust or authorize an ownership transition.

## Generated ownership and source control

AXM owns lockfile serialization and normal mutation. Users commit the file so
clones and collaborators begin with the same selections, but they do not need
to maintain its entries by hand.

When one operation changes the lockfile together with settings, trust,
canonical content, or projections, those affected changes form one unit. A
lockfile write failure rolls back that unit. Concurrent updates to one workspace
scope must not interleave or discard independent entries.

Schema evolution must never silently reinterpret existing data. Writes preserve
unknown top-level data they did not create, while unsupported versions, removed
fields, and invalid nested entries are diagnosed explicitly.

## Missing, invalid, and stale lockfiles

A missing lockfile means desired extensions have no recorded selections. Sync
or the relevant lifecycle command may resolve them from workspace configuration
and trusted metadata. If several versions now satisfy a constraint, the plan
shows the newly selected version; there is no previous pin to preserve.

A malformed or unsupported lockfile is recoverable generated state. AXM does
not guess at partially readable entries. Reconciliation may replace it only
after deriving a complete valid snapshot from desired state and trust, and the
replacement participates in the same atomic workspace change as the resulting
content and projections.

An entry that is no longer reachable from desired state is stale. It neither
retains its package nor proves that the package is installed. AXM removes stale
entries only when the desired dependency graph is complete enough to make that
decision safely.

These cases require no lockfile edit, generic repair command, or overloaded
install behavior. They are ordinary reconciliation from authoritative inputs.
---

status: stable
description: Authority and recovery semantics of the AXM workspace lockfile.
---
