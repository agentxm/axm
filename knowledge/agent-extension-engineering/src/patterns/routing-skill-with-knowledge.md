---
type: Pattern
title: "Routing skill with a knowledge bundle"
description: "When several workflows share detailed guidance, route each request to the concept it needs."
tags: ["skills", "knowledge", "routing", "shared guidance", "packs"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T22:48:38Z" }
sources:
  - id: engineering
    resource: https://github.com/agentxm/axm/blob/03a82fdd2a0aebeb8fb3f38c99afe303bfad77a0/skills/agent-extension-engineering/src/SKILL.md
    title: Agent extension engineering skill
  - id: docs
    resource: https://github.com/agentxm/axm/blob/03a82fdd2a0aebeb8fb3f38c99afe303bfad77a0/agent_extensions/registry.agentxm.ai/@craigsmitham/skills/docs/src/SKILL.md
    title: Docs skill
---

# Routing skill with a knowledge bundle

When related tasks need different parts of a large body of guidance, let a
small skill recognize the request and select a knowledge concept. Keep the
substantive advice in the concept so it can also answer a direct lookup.

The Docs skill sends a request to mine a pattern to one concept and a request
to organize a collection to another.[^docs] The extension engineering skill
uses the same arrangement for authoring and review.[^engineering]

A router adds a lookup and a dependency. Keep a short, self-contained workflow
in its skill when there is little to select. When the bundle is required, ship
the pair together and update the router whenever a concept it names moves.
See [Composing extension packs](../guides/composing-packs.md) for choosing and
checking compatible members.

[^docs]: Docs skill, need-to-concept table.

[^engineering]: Agent extension engineering skill, use-case table.
