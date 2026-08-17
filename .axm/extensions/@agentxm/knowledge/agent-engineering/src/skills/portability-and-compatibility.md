---
type: Explanation
title: Portability and compatibility
description: How to keep a portable core while making host requirements and degradation explicit.
tags: [agent-skills, portability, compatibility, hosts]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:36:04Z }
stale_after: 2027-02-14
sources:
  - id: agent-skills-spec
    resource: https://agentskills.io/specification
    title: Agent Skills specification
---

# Portability and compatibility

Portable skills depend first on the open package contract: a named directory,
`SKILL.md`, portable frontmatter, relative resource paths, and declared runtime
requirements.[^agent-skills-spec] Host-specific metadata should refine this core
without making the core misleading.

For every claimed host, identify discovery locations, invocation controls,
supported frontmatter, tool semantics, path behavior, limits, and distribution
mechanism. Classify the result as:

- **portable** — the same package preserves its contract;
- **adapted** — a small host-owned adapter or metadata file is required;
- **degraded** — the central outcome remains but a named capability is lost; or
- **unsupported** — the job cannot be fulfilled honestly.

Do not claim compatibility from syntax alone. Exercise routing, resource
loading, scripts, permissions, and observable outcomes on each named host and
model. Unknown behavior is unknown, not portable by default.

[^agent-skills-spec]: Agent Skills specification
