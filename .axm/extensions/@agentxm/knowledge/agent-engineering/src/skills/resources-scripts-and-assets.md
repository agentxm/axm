---
type: Reference
title: References, scripts, and assets
description: How to assign supporting material by semantics rather than directory convention.
tags: [agent-skills, references, scripts, assets, resources]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:36:04Z }
stale_after: 2027-02-14
sources:
  - id: agent-skills-spec
    resource: https://agentskills.io/specification
    title: Agent Skills specification
---

# References, scripts, and assets

Optional directories exist to serve different semantics. Create only the
resources the workflow actually needs.[^agent-skills-spec]

| Need                                                       | Artifact      | Design obligation                                                      |
| ---------------------------------------------------------- | ------------- | ---------------------------------------------------------------------- |
| Conditional facts, schemas, policies, or detailed examples | `references/` | Focus the file and route to it from the relevant step                  |
| Exact repeated mechanics                                   | `scripts/`    | Declare inputs, dependencies, outputs, side effects, errors, and tests |
| Templates or material copied into outputs                  | `assets/`     | Preserve licensing and distinguish output material from instructions   |

## Script quality

A bundled script should be self-contained or explicit about dependencies, safe
by default, scoped to resolved targets, non-interactive for automation, useful
on failure, and testable outside the conversation. Instructions must say when
to run it and how to interpret its result.

Do not replace judgment with code merely to appear deterministic. Do not leave
repeated fragile transformations as prose merely to avoid maintaining code.

## Resource quality

- Use synthetic fixtures in portable public packages.
- Avoid absolute local paths and undeclared sibling dependencies.
- Keep one authoritative copy of information.
- Remove placeholders, unused files, and orphaned assets before release.
- Review every packaged byte; non-`SKILL.md` content can still execute, leak,
  mislead, or violate redistribution rights.

[^agent-skills-spec]: Agent Skills specification
