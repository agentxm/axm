---
type: Reference
title: AXM skill profile
description: AXM canonical packaging, projections, manifests, packs, validation, and integrity behavior layered on the portable core.
tags: [agent-skills, axm, packaging, projections]
status: stable
stale_after: 2027-02-14
generated: { by: "codex/gpt-5", at: 2026-08-15T20:17:19Z }
sources:
  - id: axm-skills-architecture
    resource: https://github.com/agentxm/axm/blob/main/docs/architecture/extensions/skills.md
    title: AXM — Skills architecture
  - id: axm-skills-help
    resource: https://github.com/agentxm/axm/blob/main/packages/cli/help/topics/skills.md
    title: AXM CLI — Skills help
---

# AXM skill profile

AXM workspaces keep authored skill content under a canonical extension package
and project it into host discovery locations. Author through AXM and edit the
canonical `src/` content, never a generated agent-specific projection. Current
CLI behavior and schemas are documented by AXM.[^axm-skills-architecture]

An AXM skill package combines the portable `src/SKILL.md` tree with `skill.json`
for registry metadata such as version, human description, license, repository,
keywords, standalone status, and recommended packs. Portable frontmatter belongs
in `SKILL.md`; distribution metadata belongs in the manifest.[^axm-skills-help]

Cross-extension references require an intentional pack: every referenced
extension must be a direct dependency, the referencing skill must be non-
standalone and recommend that pack, and paths must use AXM's canonical extension
layout. Projection paths and shared local installation state are not dependency
contracts.[^axm-skills-help]

Use the CLI's current help before mutations, preview changes, lint the workspace,
review generated state, and verify pack dependencies and integrity before
publishing. AXM behavior is versioned; this profile was checked against AXM
0.27.5 and must be refreshed against the current CLI and schema after its
`stale_after` date.

[^axm-skills-architecture]: AXM — Skills architecture

[^axm-skills-help]: AXM CLI — Skills help
