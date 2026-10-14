---
type: Reference
title: GitHub Copilot and VS Code skill profile
description:
  Copilot-specific locations, invocation controls, forked context, and plugin
  behavior layered on the portable core.
tags: [agent-skills, github-copilot, vscode, compatibility]
status: stable
stale_after: 2027-02-14
generated: { by: "codex/gpt-6", at: 2026-10-01T03:12:00Z }
sources:
  - id: vscode-agent-skills
    resource: https://code.visualstudio.com/docs/copilot/customization/agent-skills
    title: Visual Studio Code — Agent Skills
---

# GitHub Copilot and VS Code skill profile

This profile's source describes the VS Code host. Apply its guidance to that
surface; assess Copilot CLI, hosted coding agents, and other editors separately.
The 2026-10-01 scope correction does not recertify the host behavior below.

Consult the VS Code documentation for current discovery settings and
precedence[^vscode-agent-skills], and the
[Agent Capability Catalog](https://github.com/agentxm/axm/blob/main/packages/core/extension-model/src/unstable/agent-capabilities/data/agents/README.md)
for scoped native readers and AXM delivery. Keep path inventories there rather
than duplicating them in authoring guidance.

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
