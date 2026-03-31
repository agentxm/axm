# TypeScript Style Guide

Strict TypeScript conventions for `axm`. Use this guide for type boundaries,
narrowing, assertions, and immutable data shapes. It complements the repo-wide
rules in AGENTS.md and CLAUDE.md and focuses on why those rules matter in day to
day code.

> [TypeScript](../../AGENTS.md#typescript) - critical guidance
>
> [TypeScript](../../CLAUDE.md#typescript) - duplicate agent copy

## Key Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/) - Language
  reference
- [Effect Guide](./effect.md) - Effect-specific patterns used in this repo
- [Effect Option Guide](./effect-option.md) - Option versus nullable guidance

---

## Type Boundaries

Let TypeScript infer local values when the initializer is obvious. Be explicit
at boundaries where a reader or caller benefits from seeing the contract.

- Prefer inferred local variables over noisy annotations
- Type function parameters explicitly
- Prefer schema-derived types for validated data
- Let Effect infer return types unless a public API or recursive function needs
  an explicit annotation
- Treat parsed JSON, environment input, and third-party output as `unknown`
  until validated

---

## Assertions and Narrowing

This repo forbids `as` casts and non-null assertions because they hide the
actual proof of correctness.

- Use discriminated unions and control-flow narrowing first
- Use `satisfies` and `as const` to preserve inference without lying
- Use assertion functions only when TypeScript truly cannot express the check
- Use `satisfies never` or `Match.exhaustive` for exhaustive branching
- Decode parsed data with `Schema.decodeUnknown*` instead of asserting types

---

## Immutability and Collections

Favor immutable shapes so handlers and services stay predictable under refactor
and concurrency.

- Prefer `readonly` properties and `ReadonlyArray`
- Do not mutate function parameters
- Prefer literal objects and `as const` for stable config or lookup tables
- Model domain distinctions with brands instead of reusing raw `string` or
  `number` everywhere

---

## See Also

- [Effect Guide](./effect.md) - Effect conventions and services
- [Testing Guide](./testing.md) - Test quality and coverage expectations
