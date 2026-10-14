---
type: Reference
title: OpenAI skill profile
description:
  OpenAI-specific discovery, invocation, metadata, and distribution behavior
  layered on the portable core.
tags: [agent-skills, openai, codex, compatibility]
status: stable
stale_after: 2027-02-14
generated: { by: "codex/gpt-6", at: 2026-10-01T03:12:00Z }
sources:
  - id: openai-build-skills
    resource: https://learn.chatgpt.com/docs/build-skills
    title: OpenAI — Build skills
  - id: openai-plugin-architecture
    resource: https://developers.openai.com/plugins/concepts/plugins
    title: OpenAI — Plugin architecture
  - id: codex-hooks
    resource: https://learn.chatgpt.com/docs/hooks
    title: OpenAI — Hooks
---

# OpenAI skill profile

## Product and runtime scope

Name the claimed surface: Codex CLI, IDE extension, Cloud, ChatGPT Work, or
ordinary ChatGPT. A shared plugin listing does not make every packaged
capability available on each surface. In particular, plugin installation on the
web does not deploy hook scripts into an execution
environment.[^openai-plugin-architecture]

The Codex hook runtime supports command and MCP-tool handlers; it parses but
skips prompt and agent handlers. Hook availability therefore cannot be inferred
from accepted configuration syntax.[^codex-hooks] Use the
[Agent Capability Catalog](https://github.com/agentxm/axm/blob/main/packages/core/extension-model/src/unstable/agent-capabilities/data/agents/README.md)
and its primary sources for the current event, permission, discovery, and AXM
delivery contracts. Keep runtime behavior separate from AXM writer support.

The 2026-10-01 review covers these surface and hook distinctions. It does not
renew prior metadata or invocation claims, or establish runtime verification.

## Skill authoring

Skills package instructions, resources, and optional scripts for repeatable
workflows. Use the current documentation for the selected surface's discovery,
selection, and distribution behavior.[^openai-build-skills]

Design implications:

- treat name and description as a scarce discovery index; the initial skill list
  is bounded by a context budget;
- put routing triggers and only necessary neighboring exclusions in the
  description, not only the body;
- keep `SKILL.md` concise and load references, scripts, and assets on demand;
- use `agents/openai.yaml` only for OpenAI-specific presentation, invocation
  policy, or dependency metadata; do not make it the sole source of the portable
  contract;
- keep `display_name`, `short_description`, and `default_prompt` human-facing
  and consistent with the portable skill's job and boundaries; omit optional
  presentation fields that no claimed surface needs;
- preserve existing `policy` and dependency metadata during revisions unless the
  requested capability changes them;
- leave implicit invocation enabled by default and set
  `policy.allow_implicit_invocation` to `false` only when the product is
  intentionally explicit-selection-only; do not use invocation policy as a
  substitute for action-time permission enforcement;
- distribute reusable collections through a supported plugin or package
  mechanism rather than assuming local installation state.

Test the documented explicit selection path on each claimed surface. Test
natural-language routing only when implicit invocation is allowed. Product
behavior is versioned and this profile must be refreshed after its `stale_after`
date.

[^openai-build-skills]: OpenAI — Build skills

[^openai-plugin-architecture]: OpenAI — Plugin architecture

[^codex-hooks]: OpenAI — Hooks
