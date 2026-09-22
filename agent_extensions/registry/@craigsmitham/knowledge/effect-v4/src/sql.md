---
type: Checklist
title: SQL
description: Evaluate whether database access has explicit client, schema, statement, transaction, retry, telemetry, and testing boundaries.
tags: [effect, effect-v4, sql, transaction, schema, repository, database]
status: stable
sources:
  - id: effect-sql
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/ai-docs/src/40_sql/10_basics.ts
    title: Effect 4.0.0-rc.117 SQL basics
  - id: effect-sql-client
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/packages/effect/src/unstable/sql/SqlClient.ts
    title: Effect 4.0.0-rc.117 SqlClient source
  - id: effect-sql-error
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/packages/effect/src/unstable/sql/SqlError.ts
    title: Effect 4.0.0-rc.117 SqlError source
  - id: effect-pg-client
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/packages/sql/pg/src/PgClient.ts
    title: Effect 4.0.0-rc.117 native PostgreSQL client
  - id: effect-pg-types
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/packages/sql/pg/src/PgTypes.ts
    title: Effect 4.0.0-rc.117 PostgreSQL binary codecs
  - id: effect-sqlite-do-client
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/packages/sql/sqlite-do/src/SqliteClient.ts
    title: Effect 4.0.0-rc.117 Durable Object SQLite client
generated: { by: claude/opus-5.5, at: 2026-09-22T21:20:55Z }
---

# SQL

- [ ] Provide the dialect-specific client layer at the infrastructure edge and
  expose database behavior through repositories or domain services.
- [ ] Use parameterized statement construction; never concatenate untrusted
  values into SQL text.
- [ ] Decode selected rows and encode statement inputs with schemas matching
  the driver's actual scalar and JSON representations.[^effect-pg-types]
- [ ] Keep `SqlError` and its reason available until the owning repository,
  service, handler, or scheduler can translate or recover correctly.
- [ ] Enclose every statement that must commit or roll back together in one
  transaction owned by the operation with that atomicity requirement.
- [ ] Confirm the dialect client supports the transaction shape relied on:
  nesting and savepoint release, concurrent sibling transactions, and
  asynchronous work inside the transaction.[^effect-sqlite-do-client]
- [ ] Retry only known retryable reasons such as serialization or deadlock
  failures, around the complete repeat-safe transaction, with a bound.
- [ ] Keep credentials and sensitive parameters out of telemetry; control
  whether raw query text is recorded in spans or diagnostics.
- [ ] Match prepared-statement settings to the deployed connection pooler's
  capabilities when the driver caches named statements.[^effect-pg-client]
- [ ] Run integration tests against the supported dialect for constraints,
  transactions, concurrency, schema decoding, and retry behavior.

## Resources

- [SQL basics](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/ai-docs/src/40_sql/10_basics.ts)
- [SqlClient source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/packages/effect/src/unstable/sql/SqlClient.ts)
- [SqlError source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/packages/effect/src/unstable/sql/SqlError.ts)
- [Native PostgreSQL client and pool configuration](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/packages/sql/pg/src/PgClient.ts)
- [Durable Object SQLite transactions](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/packages/sql/sqlite-do/src/SqliteClient.ts)
- [PostgreSQL parameter and result codecs](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.117/packages/sql/pg/src/PgTypes.ts)

[^effect-pg-types]: Effect PostgreSQL binary codecs.
[^effect-pg-client]: Effect native PostgreSQL client.
[^effect-sqlite-do-client]: Effect Durable Object SQLite client.
