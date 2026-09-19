---
type: Domain Concept
description: The AXM vs. AgentXM naming convention — when to write the all-caps product name, when to use the lowercase code identifier, and how the CLI relates to the platform.
tags: [naming, axm, agentxm, branding, conventions]
status: stable
generated:
  by: claude/fable-5
  at: 2026-08-06T13:04:04Z
sources:
  - id: axm-agents-md
    resource: https://github.com/agentxm/axm/blob/main/AGENTS.md
    title: AXM repository AGENTS.md (naming section)
---

# AXM and AgentXM naming

**AXM** is the official name of the CLI — all caps, an acronym for **A**gent
e**X**tension **M**anager.[^axm-agents-md]

- Use **AXM** in prose and headings.
- Use lowercase `axm` only where an identifier must match reality: CLI
  command references (`axm install`), package names (`@agentxm/*`, `axm.sh`
  on npm), filesystem paths, repository names, and hostnames (`axm.sh`).
- **AgentXM** names the platform and registry (AgentXM.ai). AXM is the CLI
  component of that platform; the two are related but not interchangeable —
  "AXM" is never a synonym for the whole platform.

The split keeps human-facing text consistent while preserving exact lowercase
identifiers everywhere an identifier is load-bearing, and it prevents the CLI
name from absorbing the registry and other product surfaces.

[^axm-agents-md]: AXM repository AGENTS.md (naming section).
