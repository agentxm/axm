---
name: effect-v4-config
description: Centralizes typed and validated configuration with Effect v4. Use when code reads `process.env` directly, repeats parsing or defaults, starts before configuration is validated, mishandles secrets, or is hard to configure in tests—even without current Config usage. Skip runtime business data and values that should be explicit function inputs.
compatibility: Effect 4.0.0-beta.107
---

# Effect v4 config

Describe configuration once, validate it at composition, and inject the result.

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
