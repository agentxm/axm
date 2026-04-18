# Effect Guide

Comprehensive Effect v4 patterns for using Effect as this project's standard
library. Covers typed errors, `ServiceMap.Service`-based services,
Option/nullable handling, collections (Array, Chunk, HashMap), iteration and
streaming, schema validation, wrapping external APIs, and testing Effect
programs.

This repo commonly aliases `effect/Context` as `ServiceMap`, so local examples
use `ServiceMap.Service` and `ServiceMap.Reference`. Upstream Effect docs and
newer migration notes call the same API surface `Context.Service`.

> [Effect](../../CLAUDE.md#effect) — critical guidance

## Key Resources

- [Effect Option Guide](./effect-option.md) — Option versus nullable guidance for
  this repo
- [Effect v4 Quick Reference](./effect-v4-quick-ref.md) — Common migration
  patterns used here
- [Effect Context](https://effect.website/docs/context-management/services-and-layers/) —
  Official service and layer documentation
- [Effect Error Management](https://effect.website/docs/error-management/two-error-types/) —
  Official error handling patterns
- [Effect Schema Classes](https://effect.website/docs/schema/classes/) —
  Schema.TaggedClass, Schema.Class, and class-based schemas
- [Effect Solutions - Data Modeling](https://www.effect.solutions/data-modeling) —
  Tagged unions, branded types, and domain modeling patterns
- [EffectPatterns](https://github.com/PaulJPhilp/EffectPatterns) —
  Community patterns for error recovery, streams, and configuration

## Skills

| Skill                                                                                   | Command | Description                                                |
| --------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------- |
| [effect-basics](../../.axm/extensions/@axm/skills/effect-basics/src/SKILL.md)           | —       | Core patterns, when to use functions vs services           |
| [effect-service](../../.axm/extensions/@axm/skills/effect-service/src/SKILL.md)         | —       | Service definition, interface design, error types, retries |
| [effect-layers](../../.claude/skills/effect-layers/SKILL.md)                            | —       | Layer construction, composition, provision, memoization    |
| [effect-option](../../.axm/extensions/@axm/skills/effect-option/src/SKILL.md)           | —       | Option vs nullable types, conversion at boundaries         |
| [effect-collections](../../.axm/extensions/@axm/skills/effect-collections/src/SKILL.md) | —       | Arrays, Chunks, Records, HashMaps: when to use each        |
| [effect-iteration](../../.axm/extensions/@axm/skills/effect-iteration/src/SKILL.md)     | —       | Loops, forEach, all, Schedule, retries and polling         |
| [effect-stream](../../.axm/extensions/@axm/skills/effect-stream/src/SKILL.md)           | —       | Stream for lazy, unbounded, or resource-scoped sequences   |
| [effect-schema](../../.axm/extensions/@axm/skills/effect-schema/src/SKILL.md)           | —       | Schema naming conventions and type inference               |
| [effect-wrapping](../../.axm/extensions/@axm/skills/effect-wrapping/src/SKILL.md)       | —       | Wrap Promise-based APIs with Effect conventions            |
| [effect-filesystem](../../.axm/extensions/@axm/skills/effect-filesystem/src/SKILL.md)   | —       | FileSystem and Path services, never use node:fs/node:path  |
| [effect-testing](../../.axm/extensions/@axm/skills/effect-testing/src/SKILL.md)         | —       | Testing patterns for Effect programs                       |

---

## Type Inference

**Prefer inference over explicit return type annotations.** Effect's architecture
enables powerful type inference—the covariant `R` parameter automatically tracks
dependencies as you compose effects.

- Let Effect infer `Effect<A, E, R>` signatures
- Avoid tacit (point-free) usage which breaks inference
- Add explicit annotations only at published package boundaries (types
  consumed by external callers), recursive functions, or when TypeScript
  requires them (`Effect.async`)
- Internal monorepo functions do not need return type annotations even if
  exported across workspace packages

See [CLAUDE.md#type-inference](../../CLAUDE.md#type-inference) for examples.

---

## Why Effect?

Effect serves as this project's standard library, replacing raw Promises and
async/await with composable operations. The CLI architecture separates
`effect/unstable/cli` parsing from Effect handlers so business logic stays
independently testable from CLI wiring.

Key benefits for this codebase:

- **Typed errors** — CLI commands surface specific failure modes (not just
  `unknown`)
- **Service layers** — Handlers declare dependencies; layers provide them at the
  edge
- **Testability** — Test layers replace real services without mocking
- **Concurrency** — `Effect.all` and `Effect.forEach` parallelize I/O safely

The type signature `Effect<A, E, R>` captures success type, error type, and
dependencies. When you see `Effect<User, AuthError | DbError, Database>`, you
know exactly what it returns, what can go wrong, and what it needs to run.
