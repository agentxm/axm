---
type: Reference
title: Templates and composition
description: How fixed and variable content combine without confusing instructions, data, or ownership.
tags: [prompt-template, variables, composition, fixed-content, dynamic-content, escaping]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T20:43:46Z }
stale_after: 2027-02-14
sources:
  - id: anthropic-tools
    resource: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-tools
    title: Anthropic — Console prompting tools
  - id: owasp-injection
    resource: https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
    title: OWASP — LLM Prompt Injection Prevention Cheat Sheet
---

# Templates and composition

A prompt template separates reusable instructions from values supplied for one
invocation. Composition is correct only when every inserted value has a named
meaning, trust level, and representation.

## Variable contract

For each variable, define:

- semantic name and type;
- source and authority;
- whether it may contain untrusted instructions or markup;
- permitted size and omission behavior;
- escaping, delimiting, or structured representation;
- whether its order relative to other content is material; and
- representative normal, edge, and hostile values.

Anthropic distinguishes fixed instructions from changing user, retrieval,
history, and tool-result content so templates can be tested and versioned
independently.[^anthropic-tools]

## Composition rules

1. Keep fixed policy and task instructions separate from variable data.
2. Delimit variable regions and label their role; do not interpolate raw values
   into instructional sentences when a structured field is available.
3. Preserve one source of truth for each invariant instead of assembling
   overlapping fragments that may contradict.
4. Fail visibly on missing required variables, invalid types, or truncation.
5. Record the rendered prompt or an attributable equivalent for evaluation
   without logging secrets or prohibited data.

Clear separation reduces accidental instruction confusion, but OWASP treats it
as only one layer against prompt injection.[^owasp-injection] Sanitization,
least privilege, approval, output validation, and monitoring remain outside the
template.

[^anthropic-tools]: Anthropic — Console prompting tools

[^owasp-injection]: OWASP — LLM Prompt Injection Prevention Cheat Sheet
