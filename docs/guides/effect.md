# Effect Guide

Patterns for typed errors, services, and async operations. This project uses
Effect for all business logic and I/O.

> [Effect](../../CLAUDE.md#effect) — critical guidance

## Key Resources

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

- `/effect-basics` — Core patterns, when to use functions vs services
- `/effect-service` — Service interfaces, error types, layers, retry policies
- `/effect-testing` — Testing patterns for Effect programs

---

## Why Effect?

Effect serves as this project's standard library, replacing raw Promises and
async/await with composable operations. The CLI architecture separates yargs
parsing from Effect handlers—this enables testing business logic independently
from CLI wiring.

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
