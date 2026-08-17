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
- put all routing triggers and exclusions in the description, not only the body;
- keep `SKILL.md` concise and load references, scripts, and assets on demand;
- use `agents/openai.yaml` only for OpenAI-specific presentation, invocation
  policy, or dependency metadata; do not make it the sole source of the
  portable contract;
- set `policy.allow_implicit_invocation` to `false` when a skill must require
  explicit selection instead of natural-language routing;
- distribute reusable collections through a supported plugin or package
  mechanism rather than assuming local installation state.

Test `@` selection in ChatGPT and `/skills` or `$` selection in Codex for every
surface being claimed. Test natural-language routing only when implicit
invocation is allowed. Product behavior is versioned and this profile must be
refreshed after its `stale_after` date.

[^openai-build-skills]: OpenAI — Build skills
