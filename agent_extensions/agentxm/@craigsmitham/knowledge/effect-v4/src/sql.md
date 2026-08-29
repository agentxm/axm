---
type: Checklist
title: SQL
description: Evaluate whether database access has explicit client, schema, statement, transaction, retry, telemetry, and testing boundaries.
tags: [effect, effect-v4, sql, transaction, schema, repository, database]
status: stable
sources:
  - id: effect-sql
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/40_sql/10_basics.ts
    title: Effect 4.0.0-rc.112 SQL basics
  - id: effect-sql-client
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/unstable/sql/SqlClient.ts
    title: Effect 4.0.0-rc.112 SqlClient source
  - id: effect-sql-error
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/unstable/sql/SqlError.ts
    title: Effect 4.0.0-rc.112 SqlError source
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
---

# SQL

- [ ] Provide the dialect-specific client layer at the infrastructure edge and
  expose database behavior through repositories or domain services.
- [ ] Use parameterized statement construction; never concatenate untrusted
  values into SQL text.
- [ ] Decode selected rows and encode statement inputs with schemas at the
  database boundary instead of trusting driver shapes.
- [ ] Keep `SqlError` and its reason available until the owning repository,
  service, handler, or scheduler can translate or recover correctly.
- [ ] Enclose every statement that must commit or roll back together in one
  transaction owned by the operation with that atomicity requirement.
- [ ] Retry only known retryable reasons such as serialization or deadlock
  failures, around the complete repeat-safe transaction, with a bound.
- [ ] Keep credentials and sensitive parameters out of telemetry; control
  whether raw query text is recorded in spans or diagnostics.
- [ ] Run integration tests against the supported dialect for constraints,
  transactions, concurrency, schema decoding, and retry behavior.

## Resources

- [SQL basics](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/40_sql/10_basics.ts)
- [SqlClient source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/unstable/sql/SqlClient.ts)
- [SqlError source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/unstable/sql/SqlError.ts)
