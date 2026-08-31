# AXM architecture

Navigation for the accepted product and system architecture of AXM.

## Requirements

- [Specification catalog](../../specifications/catalog.md) — the executable
  specifications under `specifications/` are the sole local requirements
  authority; the generated catalog is the reading path
- [Decisions](decisions/index.md) — accepted decision records with durable
  consequences; enforceable consequences live as executable specifications,
  never in the records

## Foundations

- [Overview](overview.md) — AXM's purpose, responsibilities, state model, and
  major system elements
- [Package architecture](package-architecture.md) — The target package
  responsibilities, dependency direction, enforcement, and Nx workspace
  conventions for decomposing extension management.
- [Glossary](glossary.md) — recurring AXM terms for extension authority,
  manifests, sources, authoritative lock state, workspaces, scopes, canonical
  extension content, ownership units, contributor sets, projections, and
  unowned content
- [Principles](principles.md) — command ownership, recovery, content authority,
  change scope, overrides, and verification

## Commands

- [Command architecture](commands/index.md) — responsibility boundaries across
  lifecycle, authoring, workspace configuration, inspection, lint, sync,
  output, and type-specific commands

## Extensions

- [Extension architecture](extensions/index.md) — the common extension contract
  and the architectural differences among extension types and agent-specific
  content

## Workspace

- [Workspace architecture](workspace/index.md) — desired state, current state,
  configured agents, instruction files, sources, artifacts, authority,
  ownership, and safe execution

## System-wide

- [Telemetry](system-wide/telemetry.md) — CLI observation, local control,
  privacy boundaries, and separation from Registry request logging
- [Testing strategy](system-wide/testing-strategy.md) — executable
  specifications as the sole local requirements authority, with distinct
  verification purposes, boundaries, execution, completeness, and reporting
