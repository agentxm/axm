---
type: Reference
title: GitHub Copilot and VS Code skill profile
description: Copilot-specific locations, invocation controls, forked context, and plugin behavior layered on the portable core.
tags: [agent-skills, github-copilot, vscode, compatibility]
status: stable
stale_after: 2027-02-14
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:36:04Z }
sources:
  - id: vscode-agent-skills
    resource: https://code.visualstudio.com/docs/copilot/customization/agent-skills
    title: Visual Studio Code — Agent Skills
---

# GitHub Copilot and VS Code skill profile

VS Code discovers Agent Skills from supported workspace and user locations,
including `.github/skills`, `.claude/skills`, and `.agents/skills`; consult the
current documentation for settings and precedence.[^vscode-agent-skills]

The host supports additional frontmatter that can shape user invocation and
context behavior, including argument hints, whether a skill is user-invocable,
whether model invocation is disabled, and experimental isolated or forked
execution. Treat those fields as host deltas: the portable name, description,
workflow, and resources should remain coherent without them.

Test natural-language activation, slash invocation when enabled, argument
handling, and any isolated context behavior. When distributing through a plugin,
verify both the canonical package and the projected discovery location; a local
symlink is not proof that consumers receive the same bytes.

[^vscode-agent-skills]: Visual Studio Code — Agent Skills

