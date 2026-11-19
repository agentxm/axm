---
type: Principle
title: "Preserve agent judgment"
description: "Make the user's purpose and desired outcome clear, and leave the approach to the agent by default."
tags: ["agent instructions", "skills", "authoring", "review", "overprescription", "agent autonomy"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T02:33:59Z" }
sources:
  - id: skill-authoring
    resource: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
    title: Anthropic, Skill authoring best practices
---

# Preserve agent judgment

Make the user's purpose clear enough that the agent can recognize a successful
outcome. Share the facts and constraints it needs to make a good decision.
Leave the course of action to the agent by default. When a particular method
matters, explain what depends on it.[^skill-authoring]

A maintainer asks whether an installed skill's migration link works. What
matters is whether the link resolves in the package a consumer receives. If
the user has supplied the link and a complete file listing from that archive,
the agent can answer directly. Publishing a correction requires separate
authority.

[^skill-authoring]: Anthropic, “Set appropriate degrees of freedom.”
