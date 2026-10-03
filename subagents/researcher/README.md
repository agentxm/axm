# Researcher

This workspace-authored subagent works with the installed
`@craigsmitham/skills/research` Skill. AXM maintains this fork independently;
the native role remains `researcher` so the Skill can delegate to it.

Derived from `@craigsmitham/subagents/researcher` version `0.1.1`, published by
Craig Smitham under the MIT license in
[agent-extensions](https://github.com/craigsmitham/agent-extensions/tree/main/subagents/researcher).
The fork expresses shared instructions and the Codex read-only sandbox in AXM's
subagent package contract and resolves the companion Skill through discovery.

Read-only instructions apply on every target. Codex additionally receives its
native `sandbox_mode = "read-only"` configuration; AXM does not translate that
setting into another runtime's permission model.
