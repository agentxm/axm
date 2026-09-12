---
type: Architecture
status: stable
description: How AXM removes direct extension intent while preserving other desired routes.
depends-on:
  - ./overview.md
  - ../workspace/overview.md
  - ../workspace/invariants.md
---

# Uninstall

`axm uninstall` removes the selected extension's direct route from workspace
configuration. Desired-state reachability, not installation history, decides
which content remains afterward.

## Responsibilities

Uninstall recomputes the affected desired state and removes lock entries,
AXM-managed canonical extension content, and AXM-owned projections only when no
desired route retains them. If a Pack still reaches the selected extension,
AXM keeps it and reports that result truthfully.

Cleanup that depends on the complete dependency graph waits until AXM can
derive that graph safely. The settings change, lock-row removal, canonical
cleanup, and owned-output cleanup in one semantic mutation closure commit
atomically.

## Non-responsibilities

Uninstall does not break remaining Pack-derived routes, delete
workspace-authored or unowned content, repair unrelated state, or use an
override to make an otherwise desired extension unreachable.

## Reporting the affected state

Preview and apply use one prepared candidate. Mutation targets name actual
files, directories, native entries, and owned regions. Paths come from accepted
canonical observations and the configured workspace layout, including the
source-directory segment of acquired packages.

Retained, absent, and unverifiable content appears as references with a reason,
separate from mutation targets. Authored source and content still required by
another desired route remain visible in the result. Removing a native MCP
entry or an owned instruction region updates its shared container; it does not
report deletion of the whole file. Material reference inputs participate in
candidate revalidation even when they are retained.

## Specifications

The `cli/uninstall/*` specifications own uninstall's binding obligations —
removing the direct route while keeping state another desired route still
reaches (`cli/uninstall/removes-direct-route-and-recomputes-reachability`) and
idempotent repeat runs (`cli/uninstall/is-idempotent`), and precise removed and
retained effects (`cli/uninstall/reports-removed-and-retained-state`). The
[specification catalog](../../../specifications/catalog.md) resolves each
identity to its owning project and file.
