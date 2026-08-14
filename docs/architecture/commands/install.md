---
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
- establishes required trust for acquired external content;
- materializes canonical extension content and required agent projections; and
- applies those affected changes as one safe operation.

Installing an extension already desired at the requested constraint is a
successful no-op. Supplying a different constraint explicitly authorizes
changing that durable choice; it does not require a replacement override.

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

## Testing strategy

Behavior tests prove configuration and realized-state postconditions,
idempotence, affected-work atomicity, preservation of unrelated and unowned
state, constraint replacement, and parity between root and type-specific forms.
