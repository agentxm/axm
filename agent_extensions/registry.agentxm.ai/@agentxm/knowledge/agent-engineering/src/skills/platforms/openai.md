---
type: Reference
title: OpenAI skill profile
description: OpenAI-specific discovery, invocation, metadata, and distribution behavior layered on the portable core.
tags: [agent-skills, openai, codex, compatibility]
status: stable
stale_after: 2027-02-14
generated: { by: "codex/gpt-5", at: 2026-08-15T20:17:19Z }
sources:
  - id: openai-build-skills
    resource: https://learn.chatgpt.com/docs/build-skills
    title: OpenAI — Build skills
---

# OpenAI skill profile

OpenAI Codex supports explicit invocation and implicit selection from discovered
skill metadata. Repository-, user-, admin-, and system-level locations can
contribute skills; use the current product documentation for the precise search
order and supported paths.[^openai-build-skills]

Design implications:

- treat name and description as a scarce discovery index; the initial skill
  list is bounded by a context budget;
- put routing triggers and only necessary neighboring exclusions in the
  description, not only the body;
- keep `SKILL.md` concise and load references, scripts, and assets on demand;
- use `agents/openai.yaml` only for OpenAI-specific presentation, invocation
  policy, or dependency metadata; do not make it the sole source of the
  portable contract;
- keep `display_name`, `short_description`, and `default_prompt` human-facing
  and consistent with the portable skill's job and boundaries; omit optional
  presentation fields that no claimed surface needs;
- preserve existing `policy` and dependency metadata during revisions unless
  the requested capability changes them;
- leave implicit invocation enabled by default and set
  `policy.allow_implicit_invocation` to `false` only when the product is
  intentionally explicit-selection-only; do not use invocation policy as a
  substitute for action-time permission enforcement;
- distribute reusable collections through a supported plugin or package
  mechanism rather than assuming local installation state.

Test `@` selection in ChatGPT and `/skills` or `$` selection in Codex for every
surface being claimed. Test natural-language routing only when implicit
invocation is allowed. Product behavior is versioned and this profile must be
refreshed after its `stale_after` date.

[^openai-build-skills]: OpenAI — Build skills
