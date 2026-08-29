---
type: Checklist
title: Config
description: Evaluate whether configuration is typed, validated, secret-safe, centralized, and replaceable in tests.
tags: [effect, effect-v4, config, environment, validation, redacted, secrets]
status: stable
sources:
  - id: effect-config
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Config.ts
    title: Effect 4.0.0-rc.112 Config source
  - id: effect-provider
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/ConfigProvider.ts
    title: Effect 4.0.0-rc.112 ConfigProvider source
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/dc4449df0d52199704ea4989a5a993ebbc605612/packages/stats/server/src/server.ts
    title: opencode typed server config at dc4449d
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
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
  secret, and valid configurations without mutating process-global state.

## Resources

- [Config source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Config.ts)
- [ConfigProvider source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/ConfigProvider.ts)
- [Applied typed config in opencode](https://github.com/anomalyco/opencode/blob/dc4449df0d52199704ea4989a5a993ebbc605612/packages/stats/server/src/server.ts)
