---
type: Comparison
description: How skills.sh discovery and source-repository installation overlap with AgentXM's Agent Skills workflows.
tags: [comparisons, skills-sh, agent-skills, discovery, installation]
status: stable
stale_after: 2026-11-13
generated:
  by: openai/codex
  at: 2026-08-14T01:00:04Z
sources:
  - id: directory
    resource: https://skills.sh/
    title: The Agent Skills Directory
  - id: cli
    resource: https://github.com/vercel-labs/skills
    title: skills CLI source and documentation
---

# skills.sh

skills.sh presents an open directory for discovering Agent Skills. Its
companion `skills` CLI installs selected skills from source repositories into
supported agent clients.[^directory][^cli]

## Overlap with AgentXM

Both products help people discover Agent Skills and place them where an agent
can use them. Both recognize the open Agent Skills format and support multiple
agent clients rather than defining a private skill content format.

## Different boundary

skills.sh centers the source repository as the distribution unit and provides
a lightweight discovery-and-install path. Its documented workflow does not
introduce a separate hosted, immutable package version for each listed skill.

AgentXM wraps Agent Skills and other extension types in registry identity,
immutable extension versions, source and trust records, dependency resolution,
and managed workspace state. AXM also reconciles canonical content and
agent-specific outputs after installation.

The comparison is therefore between a deliberately simple open discovery
path and a broader extension-management system, not between two identical
registries.

[^directory]: The Agent Skills Directory.

[^cli]: skills CLI source and documentation.
