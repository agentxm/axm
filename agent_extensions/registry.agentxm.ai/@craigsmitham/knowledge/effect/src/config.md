---
type: Checklist
title: Config
description: Evaluate whether configuration is typed, validated, secret-safe, centralized, and replaceable in tests.
tags: [effect, effect-v4, config, environment, validation, redacted, secrets]
status: stable
sources:
  - id: effect-config
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/Config.ts
    title: Effect 4.1.0 Config source
  - id: effect-provider
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/ConfigProvider.ts
    title: Effect 4.1.0 ConfigProvider source
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/dc4449df0d52199704ea4989a5a993ebbc605612/packages/stats/server/src/server.ts
    title: Historical opencode typed config at dc4449d (Effect 4.0.0-beta.83)
  - id: applied-opencode-version
    resource: https://github.com/anomalyco/opencode/blob/dc4449df0d52199704ea4989a5a993ebbc605612/package.json
    title: opencode Effect beta.83 catalog at dc4449d
generated: { by: codex/gpt-6, at: 2026-10-29T19:51:52Z }
---

# Config

- [ ] Read environment variables, files, flags, or remote configuration through
  an explicit `ConfigProvider`, not directly throughout application logic.
- [ ] Describe configuration with typed `Config` values and validate ranges,
  formats, non-emptiness, and cross-field invariants before starting work.
- [ ] Apply defaults only when absence is genuinely supported product or
  operational policy; keep required values required.
- [ ] Represent credentials and secrets as `Redacted` and unwrap them only at
  the adapter that must hand them to a foreign API.
- [ ] Related settings use one documented prefix and nesting scheme, with
  consistent fallback behavior across environments.
- [ ] Load configuration once at the composition boundary when repeated reads
  could disagree or make startup failure non-deterministic.
- [ ] Keep configuration errors distinct from later domain and infrastructure
  failures so startup diagnostics remain actionable.
- [ ] Test with a controlled provider, covering missing, malformed, defaulted,
  secret, and valid configurations without mutating process-global state;
  for string-backed `Config.Record`, test whitespace and empty values against
  the chosen `trim` and `keepEmptyValues` options.[^effect-config]

## Resources

- [Config source](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/Config.ts)
- [ConfigProvider source](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/ConfigProvider.ts)
- [Historical typed config in opencode (Effect beta.83)](https://github.com/anomalyco/opencode/blob/dc4449df0d52199704ea4989a5a993ebbc605612/packages/stats/server/src/server.ts) —
  conceptual configuration evidence only. Its `Config.number`, `Config.string`,
  and `effect/unstable/http` import predate released v4; use the current Config
  sources above for APIs.[^applied-opencode-version]
- [Byte-size parsing](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/ByteSize.ts)

[^applied-opencode-version]: opencode Effect beta.83 catalog at dc4449d.

[^effect-config]: Effect Config.Record parsing options.
