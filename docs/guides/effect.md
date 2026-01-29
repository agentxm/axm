# Effect Guide

Patterns for typed errors, services, and async operations. This project uses
Effect for all business logic and I/O.

## Skills

- `/effect-basics` — Core patterns, when to use functions vs services
- `/effect-service` — Service interfaces, error types, layers, retry policies

---

## Why Effect?

Effect is a TypeScript library for building reliable, maintainable programs. It
replaces Promises with composable operations that have:

- **Typed errors** — Know exactly what can fail, not just `unknown`
- **Dependency injection** — Declare what services code needs
- **Resource safety** — Guaranteed cleanup even when things fail
- **Unified syntax** — Sync and async code looks identical

The type signature `Effect<A, E, R>` captures success type, error type, and
dependencies. When you see `Effect<User, AuthError | DbError, Database>`, you
know exactly what it returns, what can go wrong, and what it needs to run.

---

## See Also

- [Effect Context](https://effect.website/docs/context-management/services-and-layers/) —
  Official service and layer documentation
- [Effect Error Management](https://effect.website/docs/error-management/two-error-types/) —
  Official error handling patterns
