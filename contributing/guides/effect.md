---
status: active
last-reviewed: 2026-08-12
version: 0.3.0
description: Consult before writing Effect code in AXM. Routes portable Effect v4 topics to the installed public skills and records AXM-only schema and inference policy.
depends-on:
  - ./effect-errors.md
  - ./effect-layers.md
---

# Effect in AXM

AXM consumes `@craigsmitham/packs/effect-v4@0.1.0` for portable Effect
4.0.0-beta.107 guidance. This guide owns only AXM-specific policy; choose the
installed topic skill for general API patterns.

> [Effect](../../AGENTS.md#effect) — required repository policy

## Local policy

- Use the repository-matched Effect checkout at
  `../external/Effect-TS/effect` for API verification.
- Use `effect/FileSystem` and `effect/Path`, never `node:fs` or `node:path` in
  production Effect code.
- Let Effect infer `Effect<A, E, R>` for internal functions. Add explicit
  return types only at published package boundaries, for recursion, or when
  TypeScript requires one.
- Alias `effect/Context` as `ServiceMap` where the existing AXM code does so;
  upstream `Context.Service` and local `ServiceMap.Service` name the same API.
- Follow [Effect Errors](./effect-errors.md) for AXM's `AppError` and
  cancellation boundary.
- Follow [Effect Layers](./effect-layers.md) for AXM CLI composition and
  `runCliMain` policy.

### JSON Schema annotations

Generated JSON Schema emits `identifier`, `title`, `description`, `default`,
`examples`, `readOnly`, `writeOnly`, `format`, `contentEncoding`, and
`contentMediaType`. Decode-only annotations such as `message`,
`messageMissingKey`, `messageUnexpectedKey`, and `meta` are not published.

Annotations on custom `Schema.makeFilter` filters are dropped unless the
filter has JSON Schema-aware metadata. Prefer recognized checks such as
`Schema.isPattern`, then annotate that recognized check. Annotate branded
strings before `.brand()` so examples remain plain encoded values.

## Installed topic skills

| Topic                    | Skill                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Types and data           | [branded-types](../../.axm/extensions/@craigsmitham/skills/effect-v4-branded-types/src/SKILL.md), [collections](../../.axm/extensions/@craigsmitham/skills/effect-v4-collections/src/SKILL.md), [iteration](../../.axm/extensions/@craigsmitham/skills/effect-v4-iteration/src/SKILL.md), [optics](../../.axm/extensions/@craigsmitham/skills/effect-v4-optics/src/SKILL.md), [option](../../.axm/extensions/@craigsmitham/skills/effect-v4-option/src/SKILL.md), [schema-boundaries](../../.axm/extensions/@craigsmitham/skills/effect-v4-schema-boundaries/src/SKILL.md), [wrapping](../../.axm/extensions/@craigsmitham/skills/effect-v4-wrapping/src/SKILL.md)                                                             |
| Application architecture | [config](../../.axm/extensions/@craigsmitham/skills/effect-v4-config/src/SKILL.md), [error-modeling](../../.axm/extensions/@craigsmitham/skills/effect-v4-error-modeling/src/SKILL.md), [observability](../../.axm/extensions/@craigsmitham/skills/effect-v4-observability/src/SKILL.md), [request-batching-and-cache](../../.axm/extensions/@craigsmitham/skills/effect-v4-request-batching-and-cache/src/SKILL.md), [resource-safety](../../.axm/extensions/@craigsmitham/skills/effect-v4-resource-safety/src/SKILL.md), [services-and-layers](../../.axm/extensions/@craigsmitham/skills/effect-v4-services-and-layers/src/SKILL.md), [testing](../../.axm/extensions/@craigsmitham/skills/effect-v4-testing/src/SKILL.md) |
| Concurrency              | [async-coordination](../../.axm/extensions/@craigsmitham/skills/effect-v4-async-coordination/src/SKILL.md), [streams](../../.axm/extensions/@craigsmitham/skills/effect-v4-streams/src/SKILL.md), [structured-concurrency](../../.axm/extensions/@craigsmitham/skills/effect-v4-structured-concurrency/src/SKILL.md)                                                                                                                                                                                                                                                                                                                                                                                                           |
| Platforms                | [cloudflare-workers](../../.axm/extensions/@craigsmitham/skills/effect-v4-cloudflare-workers/src/SKILL.md), [filesystem](../../.axm/extensions/@craigsmitham/skills/effect-v4-filesystem/src/SKILL.md), [http-api](../../.axm/extensions/@craigsmitham/skills/effect-v4-http-api/src/SKILL.md)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
