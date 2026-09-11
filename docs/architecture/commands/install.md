---
type: Architecture
status: stable
description: How AXM install expresses direct extension intent and realizes the affected workspace state.
depends-on:
  - ./overview.md
  - ../workspace/invariants.md
---

# Install

`axm install` expresses that an extension should be directly desired in the
selected workspace scope. It then realizes the selected extension and the other
extensions that must change with it.

## Responsibilities

Install:

- adds or updates the extension's direct workspace configuration;
- resolves Pack members and an exact allowed version when needed;
- records the accepted immutable external resolution in the authoritative
  lockfile;
- materializes canonical extension content and required agent projections; and
- applies the affected semantic mutation closure atomically.

Installing an extension already desired at the requested constraint is a
successful no-op. Supplying a different constraint explicitly authorizes
changing that durable choice; it does not require a replacement override.

An inline MCP definition is already authoritative configuration, not an
extension acquisition target. Workspace-wide install reports it as not
applicable and directs reconciliation to sync; it neither resolves a source nor
prevents applicable configured extensions from proceeding.

## Non-responsibilities

Install does not repair unrelated workspace state, adopt existing unowned
content, publish extensions, or advance other satisfying resolutions merely
because newer releases exist. It does not overwrite workspace-authored or
unowned content.

## Scope and symmetry

Install preflights only the invariants required for the selected extension and
the other extensions that must change with it. Unrelated invalid extensions do
not block a valid install.

The root command is the normal fully qualified extension surface. A type
command group may accept additional type-specific inputs, but both forms
express the same durable intent and produce the same underlying plan and result.

## Specifications

The `cli/install/*` specifications own install's binding obligations — recorded
intent and realized state (`cli/install/direct-intent-recorded-and-realized`),
pure preview (`cli/install/preview-is-pure`), idempotence
(`cli/install/reinstall-is-idempotent`), preservation of unrelated and unowned
state (`cli/install/preserves-unrelated-and-unowned-state`), and parity between
root and type-specific forms
(`cli/install/root-and-type-forms-express-same-intent`). The
[specification catalog](../../../specifications/catalog.md) resolves each
identity to its owning project and file.
