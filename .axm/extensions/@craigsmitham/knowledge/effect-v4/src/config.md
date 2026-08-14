---
type: Guide
title: Config
description: Centralizing typed, validated configuration; use when code reads `process.env`, repeats defaults, starts before validation, or mishandles secrets.
tags: [effect, effect-v4, config, environment, secrets, redaction, startup-validation]
status: stable
sources:
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-config/src/SKILL.md
    title: effect-v4-config skill 0.1.0 (retired into this bundle)
generated:
  by: claude/opus-5
  at: 2026-08-12T16:20:19Z
---

# Config

Describe configuration once, validate it at composition, and inject the result.

**Applies when** code reads `process.env` directly, repeats parsing or defaults,
starts before configuration is validated, mishandles secrets, or is hard to
configure in tests — even without current Config usage.

**Leave alone** runtime business data and values that should be explicit
function inputs.

Related: [Services and layers](services-and-layers.md) for where configuration
is resolved, [Cloudflare Workers](cloudflare-workers.md) for why bindings are
not configuration, [Observability](observability.md) for redaction in telemetry.

## Define meaning

- Model names, nesting, parsing, validation, optionality, and deliberate defaults in `Config`.
- Use `Config.schema` when configuration shares domain invariants or transformations.
- Distinguish missing settings from malformed settings in diagnostics and policy.
- Do not let a fallback silently turn invalid input into a valid-looking default.

## Set the boundary

- Keep `ConfigProvider` responsible for where values come from; keep application code independent of environment-variable mechanics.
- Load configuration during layer construction so startup fails before application work begins.
- Pass validated settings through services or layers rather than reading ambient state throughout the program.
- Override the provider or configuration layer in tests.

## Protect and evolve

- Represent secrets as redacted values and unwrap them only at the integration that needs them.
- Avoid logging whole configuration objects.
- Keep environment-specific naming and compatibility aliases at the provider or adapter edge.
- Decide explicitly whether settings are startup snapshots or dynamically refreshed; ordinary config loading should not imply live reload.
- Remove obsolete settings and defaults when they stop representing supported behavior.

Do not use configuration as a hidden channel for per-request or mutable domain state.
