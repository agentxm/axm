---
type: Guide
title: SQL
description: Accessing relational databases with effect/unstable/sql; use for client wiring, statement construction, SqlError reason handling, SqlSchema boundaries, transaction ownership, and query text in traces.
tags: [effect, effect-v4, sql, sqlclient, sqlerror, transactions, sqlschema, postgres, sqlite, d1, tracing]
status: stable
sources:
  - id: src-sql-error
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/unstable/sql/SqlError.ts
    title: SqlError module source — one tagged error, eleven reasons, isRetryable, classifySqliteError (effect 4.0.0-rc.110)
  - id: src-sql-client
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/unstable/sql/SqlClient.ts
    title: SqlClient module source — service interface, make, makeWithTransaction, TransactionConnection, SafeIntegers (effect 4.0.0-rc.110)
  - id: src-statement
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/unstable/sql/Statement.ts
    title: Statement module source — Constructor helpers, Statement as Effect, compile, span attributes (effect 4.0.0-rc.110)
  - id: src-sql-schema
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/unstable/sql/SqlSchema.ts
    title: SqlSchema module source — findAll, findNonEmpty, findOne, findOneOption, void alias (effect 4.0.0-rc.110)
  - id: src-sql-resolver
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/unstable/sql/SqlResolver.ts
    title: SqlResolver module source — transaction-aware batching key (effect 4.0.0-rc.110)
  - id: src-sql-stream
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/unstable/sql/SqlStream.ts
    title: SqlStream module source — asyncPauseResume driver interop helper (effect 4.0.0-rc.110)
  - id: src-migrator
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/unstable/sql/Migrator.ts
    title: Migrator module source — loader, lock via constraint conflict, transactional run (effect 4.0.0-rc.110)
  - id: src-sql-connection
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/unstable/sql/SqlConnection.ts
    title: SqlConnection module source — Connection interface and Acquirer (effect 4.0.0-rc.110)
  - id: src-pg-client
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/sql/pg/src/PgClient.ts
    title: "@effect/sql-pg source — SQLSTATE classification and layers providing both tags (effect 4.0.0-rc.110)"
  - id: src-d1-client
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/sql/d1/src/D1Client.ts
    title: "@effect/sql-d1 source — transaction acquirer dies, atomic batch, no migrator (effect 4.0.0-rc.110)"
  - id: src-sqlite-do
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/sql/sqlite-do/src/SqliteClient.ts
    title: "@effect/sql-sqlite-do source — storage-backed transactions, nested transactions rejected (effect 4.0.0-rc.110)"
  - id: src-eventlog
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/unstable/eventlog/SqlEventLogServerUnencrypted.ts
    title: First-party SQL consumer — branching on reason._tag to absorb a constraint conflict (effect 4.0.0-rc.110)
  - id: src-eventlog-encrypted
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/unstable/eventlog/SqlEventLogServerEncrypted.ts
    title: First-party SQL consumer — ON CONFLICT DO NOTHING instead of catching a violation (effect 4.0.0-rc.110)
  - id: src-effect-catch-reason
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Effect.ts
    title: Effect module source — catchReason, catchReasons, unwrapReason, retry options (effect 4.0.0-rc.110)
  - id: docs-sql-basics
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/40_sql/10_basics.ts
    title: Official Effect docs — the Model.Class / Migrator / SqlModel spine and SqlError as a defect at the repository boundary (effect 4.0.0-rc.110)
  - id: test-pg-classification
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/sql/pg/test/SqlErrorClassification.test.ts
    title: PostgreSQL classification tests — constraint trimming and the "unknown" fallback (effect 4.0.0-rc.110)
  - id: otel-db-spans
    resource: https://github.com/open-telemetry/semantic-conventions/blob/v1.44.0/docs/db/database-spans.md
    title: OpenTelemetry semantic conventions v1.44.0 — database spans, db.operation.name, db.query.text sanitization
  - id: pg-errcodes
    resource: https://www.postgresql.org/docs/17/errcodes-appendix.html
    title: PostgreSQL 17 documentation — Appendix A, error codes
  - id: cf-d1-api
    resource: https://developers.cloudflare.com/d1/worker-api/d1-database/
    title: Cloudflare D1 Worker API — batch() executes statements as a SQL transaction
    author: team:cloudflare
    last_modified: 2026-08-17
  - id: sqlite-transaction
    resource: https://sqlite.org/lang_transaction.html
    title: SQLite documentation — BEGIN/COMMIT do not nest; SAVEPOINT and RELEASE for nesting
    author: team:sqlite
    last_modified: 2026-08-17
  - id: applied-alchemy-d1
    resource: https://github.com/alchemy-run/alchemy-effect/blob/1596e503b8d0cb06463ac676defe351b8e0e131a/packages/alchemy/src/SQL/D1.ts
    title: alchemy-effect@1596e503 — one client build published under both the dialect tag and SqlClient
  - id: applied-alchemy-routes
    resource: https://github.com/alchemy-run/alchemy-effect/blob/1596e503b8d0cb06463ac676defe351b8e0e131a/packages/alchemy/test/SQL/fixtures/routes.ts
    title: alchemy-effect@1596e503 — cross-dialect conformance surface exercising the statement helpers
  - id: applied-alchemy-lock
    resource: https://github.com/alchemy-run/alchemy-effect/blob/1596e503b8d0cb06463ac676defe351b8e0e131a/packages/alchemy/src/Auth/Lock.ts
    title: alchemy-effect@1596e503 — catchReason on a reason-carrying error, then retry on the domain failure
  - id: applied-effect-local-executor
    resource: https://github.com/lucas-barake/effect-local/blob/faa52d91faad10817906750c8cf02c71852a5521/packages/local-sql/src/QueryExecutor.ts
    title: effect-local@faa52d9 — exhaustive catchReasons partitioning transient SQL reasons from statement faults
  - id: applied-effect-local-store
    resource: https://github.com/lucas-barake/effect-local/blob/faa52d91faad10817906750c8cf02c71852a5521/packages/local-sql/src/ServerStore.ts
    title: effect-local@faa52d9 — transaction-scoped row lock, and a nested transaction used as a rollback tool
  - id: applied-opencode-session
    resource: https://github.com/anomalyco/opencode/blob/65c35977bd564e23c0e9cf124b3e3e3b9308e9e8/packages/effect-drizzle-sqlite/src/effect-sqlite/session.ts
    title: opencode@65c3597 — independent reimplementation of the savepoint protocol that also releases savepoints
generated:
  by: claude/opus-5
  at: 2026-08-17T21:36:42Z
verified:
  - by: claude/opus-5
    at: 2026-08-17T21:36:42Z
---

# SQL

Reach a relational database through one client service, one error type, and a
transaction boundary you place on purpose.

**Applies when** wiring a database client, composing statements, deciding what
a driver failure means to callers, adapting rows into domain values, or fixing
a transaction that does not cover what you thought it covered.

**Leave alone** databases with a first-class Effect integration of their own,
and query building a dialect-specific tool already owns end to end.

This guide follows the applied spine — `SqlClient` plus tagged-template
statements, with `SqlSchema` as the decode adapter — not the `Model.Class` →
`Migrator` → `SqlModel.makeRepository` spine in official docs,[^docs-sql-basics]
because the guidance here is evidence-backed and the upstream spine has no
applied evidence in the reference corpus.

Related: [Error modeling](error-modeling.md) for reason-carrying errors,
[Schema boundaries](schema-boundaries.md) for what rows decode into,
[Resource safety](resource-safety.md) for connection lifetimes,
[Cloudflare Workers](cloudflare-workers.md) for D1 and Durable Object SQLite.
Browse the module surface at the
[Effect v4 API reference](https://www.effect.website/docs/v4/api).

## Know what you are adopting

- `effect/unstable/sql` ships inside the `effect` package and carries no
  stability guarantee; pin your Effect version.[^src-sql-client]
- Nine modules exist; four carry ordinary application work — `SqlClient`,
  `Statement`, `SqlError`, `SqlSchema`. `SqlResolver` belongs to batching,
  `Migrator` to deployment, `SqlModel` to `Model.Class`, and `SqlConnection`
  and `SqlStream` to driver authors.[^src-sql-stream]
- `SqlClient` is the spine: it *is* the statement constructor, plus `reserve`,
  `withTransaction`, `transactionService`, and the reactive
  helpers.[^src-sql-client]

## Wire one client behind two tags

```ts
import { Effect } from "effect"
import { PgClient } from "@effect/sql-pg"
import { SqlClient } from "effect/unstable/sql"

// Layer<PgClient | SqlClient, SqlError>: one client, published twice.
const SqlLive = PgClient.layer({ database: "app", maxConnections: 10 })

const countUsers = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  return yield* sql<{ n: number }>`SELECT count(*) AS n FROM users`
})
```

- Depend on `SqlClient.SqlClient`, not the dialect tag, so a service stays
  portable across Postgres, SQLite, and D1. Reach for the dialect tag only for
  dialect-only capability such as `D1Client.batch`.[^src-d1-client]
- Dialect `layer`/`layerConfig`/`layerFrom` constructors already publish both
  tags from a single `make`.[^src-pg-client] When you build the client
  yourself, derive the generic tag from the dialect tag rather than building
  twice — two builds mean two prepared-statement caches and, worse, two
  transaction identities.[^applied-alchemy-d1]

## Build statements

- A `Statement<A>` *is* an `Effect<ReadonlyArray<A>, SqlError>`. Yield it;
  there is no `.execute`. `.compile()` returns `[sql, params]` without
  executing — use it to inspect or guard a statement, not to run it by
  hand.[^src-statement] [^applied-effect-local-executor]
- Interpolated values become bound parameters. `sql(name)` produces a quoted
  identifier, and `sql.insert`, `sql.update`, `sql.in`, `sql.and`, `sql.or`,
  and `sql.csv` produce fragments that nest inside other templates to arbitrary
  depth.[^src-statement] [^applied-alchemy-routes]
- `sql.unsafe` and `sql.literal` splice text in verbatim: injection surfaces
  that also leak into traces
  ([query text](#keep-query-text-out-of-your-traces)). Dialect gaps are typed —
  `sql.updateValues` is unsupported on SQLite and `never` on
  D1.[^src-statement] [^src-d1-client]

## Handle SqlError by reason

The SQL layer surfaces exactly one tagged error, `SqlError`, whose `_tag` is
always `"SqlError"`. The discriminant sits one level deeper, in `reason`.
`Effect.catchTag("UniqueViolation", …)` does not compile.[^src-sql-error]

Eleven reasons exist. Each carries `cause`, optional `message`, and optional
`operation`; `UniqueViolation` alone adds `constraint`. `error.isRetryable`
delegates to the reason, and classification is per dialect and code-driven —
the PostgreSQL column below is the whole theory behind the retryable
column.[^src-sql-error] [^src-pg-client] [^pg-errcodes]

| Reason | `isRetryable` | PostgreSQL trigger |
|---|---|---|
| `ConnectionError` | yes | class `08*` |
| `AuthenticationError` | no | class `28*` |
| `AuthorizationError` | no | `42501` |
| `SqlSyntaxError` | no | class `42*` |
| `UniqueViolation` | no | `23505`, carrying `constraint` |
| `ConstraintError` | no | class `23*` |
| `DeadlockError` | yes | `40P01` deadlock detected |
| `SerializationError` | yes | `40001` serialization failure |
| `LockTimeoutError` | yes | `55P03` lock not available |
| `StatementTimeoutError` | yes | `57014` query canceled |
| `UnknownError` | no | anything unmatched |

- Specific codes are tested before their class (`42501` before `42*`, `23505`
  before `23*`), and anything a driver cannot place becomes `UnknownError`,
  which is *not* retryable. The flag is deliberately conservative, so
  `Effect.retry({ while: (e) => e.isRetryable, schedule })` is a safe default
  for a read.[^src-sql-error] [^src-pg-client]
- Translate at the boundary that owns the domain meaning:
  `Effect.catchReason` for one reason, `Effect.catchReasons` for a
  partition.[^src-effect-catch-reason] Both leave `SqlError` in the channel
  with a narrowed reason, so a following `catchTag("SqlError", …)` still
  handles the residue.[^applied-effect-local-executor] [^applied-alchemy-lock]

```ts
import { Effect } from "effect"

// Transient infrastructure becomes one domain outage error; a specific
// violated constraint becomes a domain failure; everything else is a defect.
const unavailable = (cause: unknown) => new StorageUnavailable({ cause })

const insertUser = (email: string) =>
  sql`INSERT INTO users ${sql.insert({ email })}`.pipe(
    Effect.catchReasons("SqlError", {
      ConnectionError: unavailable,
      DeadlockError: unavailable,
      SerializationError: unavailable,
      LockTimeoutError: unavailable,
      StatementTimeoutError: unavailable,
      UniqueViolation: (r) =>
        r.constraint === "users_email_key"
          ? new EmailTaken({ email })
          : Effect.die(r),
    }),
    Effect.catchTag("SqlError", Effect.die),
  )
```

- Enumerate the reasons you translate rather than catching `SqlError` whole.
  An exhaustive `catchReasons` turns a renamed or added reason into a build
  failure instead of a silently misclassified
  outage.[^applied-effect-local-executor]
- `reason.constraint` is best-effort: PostgreSQL trims it, but a missing,
  blank, or non-string constraint degrades to the literal string `"unknown"`,
  and other dialects recover it differently or not
  at all.[^test-pg-classification] Never let a domain decision depend on
  `constraint` without a fallback.
- Prefer the cheaper sibling where the database can express the rule.
  `INSERT … ON CONFLICT DO NOTHING`, optionally with `RETURNING`, raises no
  violation at all; Effect's own event-log servers use both approaches, one per
  encryption variant.[^src-eventlog-encrypted] [^src-eventlog] Where
  first-party code does branch on a violation, it reads `error.reason._tag`
  in a small predicate and absorbs the conflict.[^src-eventlog] [^src-migrator]
- The upstream default at a repository boundary is `SqlError: Effect.die`:
  promote only genuine domain conditions into the public channel and let the
  rest be defects.[^docs-sql-basics]

## Adapt the boundary with SqlSchema

- `SqlSchema.findAll`, `findNonEmpty`, `findOne`, and `findOneOption` take
  `{ Request, Result, execute }`, encode the request before running the
  statement, and decode unknown driver rows into the result
  schema.[^src-sql-schema] `SqlSchema.void` also exists, exported through a
  `void_ as void` alias that ordinary greps miss.
- Each adapter widens the error channel beyond `SqlError`: every helper adds
  `Schema.SchemaError`, and `findOne`/`findNonEmpty` add
  `Cause.NoSuchElementError`.[^src-sql-schema] Handle those separately — a row
  that fails to decode is schema drift, not a database outage.
- Keep each adapter next to the statement it decodes, as a named value built
  once at service construction, not per call.[^applied-effect-local-store]
  Designing the schemas themselves belongs to
  [Schema boundaries](schema-boundaries.md).

## Own the transaction boundary

The boundary belongs to the handler or use case that knows the atomicity
requirement. Data-access functions are participants: they return Effects that
join whatever transaction is in context, because `withTransaction` adds
`SqlError` to `E` and *nothing* to `R` — they cannot ask for a transaction and
cannot declare that they need one.[^src-sql-client] Open a nested
`withTransaction` only as an explicit scoped-rollback tool, never as a
default.[^applied-effect-local-store]

- Propagation is per client instance: the transaction connection lives under a
  tag minted per client (`.../TransactionConnection/<clientId>`), so a
  participant built from a *second* client silently runs outside the caller's
  transaction, with no type error and no runtime warning.[^src-sql-client] That
  is the concrete reason to publish one client under both tags.
- A statement that is only correct inside a transaction — `SELECT … FOR UPDATE`,
  or a no-op `UPDATE … RETURNING` used as a row lock — is still an ordinary
  participant. Its correctness is the caller's invariant, not something the
  signature can carry.[^applied-effect-local-store]
- Nested calls emit `SAVEPOINT effect_sql_<depth>` and serialize on a one-permit
  semaphore added to the transaction context, so concurrent children run
  sequentially. Savepoints are never released at rc.110 — nested success runs
  `Effect.void`, not `RELEASE SAVEPOINT` — so a long transaction accumulates
  them. An independent reimplementation of the same protocol issues the release
  explicitly, marking this as a gap rather than a
  design.[^src-sql-client] [^applied-opencode-session]
- Two Cloudflare carve-outs: `@effect/sql-d1` sets its transaction acquirer to
  `Effect.die("transactions are not supported in D1")`, so *any*
  `withTransaction` is a defect — use `D1Client.batch`, since Cloudflare
  documents batched statements as SQL
  transactions.[^src-d1-client] [^cf-d1-api] [^sqlite-transaction] Durable
  Object SQLite allows a top-level transaction but fails *nested* ones with a
  typed `SqlError`.[^src-sqlite-do]

## Keep query text out of your traces

- Every statement runs in a `sql.execute` client span carrying
  `db.operation.name` and `db.query.text`; the dialect layer adds
  `db.system.name` and `db.namespace`. These are OpenTelemetry *stable*
  database attributes, implemented by
  name.[^src-statement] [^src-pg-client] [^otel-db-spans]
- OTel says non-parameterized query text SHOULD NOT be collected without
  sanitization, and that parameterized text needs none. Effect sets
  `db.query.text` to the *compiled* SQL and passes parameters separately, so
  ordinary interpolation is safe by construction.[^src-statement] [^otel-db-spans]
- `sql.unsafe` and `sql.literal` inline their values into that same compiled
  string, which then ships to your tracing backend in clear text. Treat any
  user data or secret passed through them as exported.[^src-statement]
- `db.transaction.commit`/`rollback`/`savepoint` are Effect-specific span
  events on the `sql.transaction` span, not OTel semantic conventions; do not
  assume a vendor dashboard understands them.[^src-sql-client] [^otel-db-spans]
  Span naming policy in general belongs to
  [Observability](observability.md).

## Treat migrations as unsettled

`Migrator` exists, ten of the twelve dialect packages ship a binding, and it is
what the only official SQL example uses.[^src-migrator] [^docs-sql-basics] No
project in the reference corpus uses it: both serious SQL consumers replaced it
with their own schema-evolution machinery, and `@effect/sql-d1` and
`@effect/sql-sqlite-wasm` ship no migrator at
all.[^src-d1-client] [^applied-effect-local-store] Evaluate it against your
deployment model rather than adopting it as settled practice; in particular its
concurrency lock is an insert that relies on a unique or constraint
conflict.[^src-migrator]

## What this guide does not cover

| Concern | Owner | The one SQL-specific fact to carry across |
|---|---|---|
| Resolvers, batching, dedup | [Request batching and cache](request-batching-and-cache.md) | Resolver batching keys on the active transaction connection, so requests inside different transactions never batch together.[^src-sql-resolver] |
| Schema design, encode/decode policy, `Model.Class`, `SqlModel` | [Schema boundaries](schema-boundaries.md) | The database is an untrusted boundary; a decode failure is a different domain failure than a `SqlError`. |
| Streaming and pagination | [Streams](streams.md) | `Statement.stream` exists, but seven of twelve dialect packages implement `executeStream` as `Stream.die("executeStream not implemented")` — check your driver before designing around it.[^src-d1-client] |
| Connection lifetime, `sql.reserve`, finalizer ordering | [Resource safety](resource-safety.md) | Nesting yields savepoints, not new transactions; commit and rollback failures are `orDie`'d.[^src-sql-client] |
| D1, Durable Object SQLite, Worker request lifetime | [Cloudflare Workers](cloudflare-workers.md) | D1 has no migrator and dies on any transaction; DO SQLite rejects nested ones.[^src-d1-client] [^src-sqlite-do] |
| Error-channel design, `catchReason` as a combinator | [Error modeling](error-modeling.md) | `SqlError` is the canonical reason-carrying error; the idiom transfers to `PlatformError`, `AiError`, and `SocketError`.[^src-effect-catch-reason] |

## If you are writing a driver

Implement `SqlConnection.Connection` (`execute`, `executeRaw`, `executeValues`,
`executeUnprepared`, `executeStream`) and hand an `Acquirer` plus a compiler to
`SqlClient.make`.[^src-sql-connection] [^src-sql-client] Build the compiler with
`Statement.makeCompiler` or `Statement.makeCompilerSqlite`, apply
`Statement.defaultTransforms` for column naming, classify driver failures into
`SqlErrorReason` (`classifySqliteError` covers SQLite), honour the
`SqlClient.SafeIntegers` reference, and supply
`beginTransaction`/`commit`/`rollback`/`savepoint` SQL where your dialect's
spelling differs.[^src-statement] [^src-sql-error] [^src-sql-client] Then stop:
everything above this section is the consumer's contract.

## Review checklist

- Application services depend on `SqlClient`, not a dialect tag, and one client
  build is published under every tag that names it.
- No `sql.unsafe` or `sql.literal` carries user input or a secret.
- Every `SqlError` translation names the reasons it handles; nothing catches
  `SqlError` whole and invents a message, and `reason.constraint` decisions
  have a fallback for `"unknown"`.
- `isRetryable` or an explicit reason list gates retry; unknown failures are
  not retried.
- Transactions open at the handler or use case, every nested `withTransaction`
  has a written reason to exist, and no participant is built from a second
  client instance.
- Decode failures from `SqlSchema` are handled separately from driver failures.

[^src-sql-error]: `packages/effect/src/unstable/sql/SqlError.ts` at `effect@4.0.0-rc.110` — `SqlError` is a `Schema.TaggedError` with tag `"SqlError"` and a single `reason` field; `SqlErrorReason` is an eleven-member union; `ReasonFields` is `{ cause, message?, operation? }` and `UniqueViolation` adds `constraint: Schema.String`; each reason defines `get isRetryable()`, `true` for `ConnectionError`, `DeadlockError`, `SerializationError`, `LockTimeoutError`, `StatementTimeoutError` and `false` for the rest, including `UnknownError`; `SqlError.isRetryable` delegates to the reason. Also exports `isSqlError`, `isSqlErrorReason`, `classifySqliteError`, `ResultLengthMismatch`.
[^src-sql-client]: `packages/effect/src/unstable/sql/SqlClient.ts` at `effect@4.0.0-rc.110` — `SqlClient extends Constructor` with `reserve`, `withTransaction: <R, E, A>(self: Effect<A, E, R>) => Effect<A, E | SqlError, R>`, `transactionService`, `reactive`, `reactiveMailbox`; `makeWithTransaction` opens the `sql.transaction` span, emits `db.transaction.commit`/`savepoint`/`rollback` events, `Effect.orDie`s commit and rollback, adds a one-permit `Semaphore` to the transaction context so nested blocks serialize, and on nested success sets `effect = Effect.void` (no `RELEASE SAVEPOINT`); `TransactionConnection(clientId)` mints the tag `effect/sql/SqlClient/TransactionConnection/<clientId>` from a per-process counter; `SafeIntegers` is a `Context.Reference` defaulting to `false`.
[^src-statement]: `packages/effect/src/unstable/sql/Statement.ts` at `effect@4.0.0-rc.110` — `Statement<A> extends Fragment, Effect<ReadonlyArray<A>, SqlError>` with `raw`, `values`, `unprepared`, `stream`, `withoutTransform`, `compile()`; `Constructor` exposes the template call, identifier call, `unsafe`, `literal`, `in`, `insert`, `update`, `updateValues` (documented unsupported on SQLite), `and`, `or`, `csv`, `join`, `onDialect`; execution opens `Effect.useSpan("sql.execute", { kind: "client" })` and sets `db.operation.name` and `db.query.text` from the compiled SQL, with parameters passed separately to the connection. Driver-facing exports: `makeCompiler`, `makeCompilerSqlite`, `defaultTransforms`.
[^src-sql-schema]: `packages/effect/src/unstable/sql/SqlSchema.ts` at `effect@4.0.0-rc.110` — `findAll`, `findNonEmpty`, `findOne`, `findOneOption`, and `void_` re-exported as `void`; each takes `{ Request, Result, execute }`, adds `Schema.SchemaError` to the error channel, and `findOne`/`findNonEmpty` additionally fail with `Cause.NoSuchElementError`.
[^src-sql-resolver]: `packages/effect/src/unstable/sql/SqlResolver.ts` at `effect@4.0.0-rc.110` — every resolver constructor passes `key: transactionKey`, which reads the active `TransactionConnection` out of the request's context and keys by reference.
[^src-sql-stream]: `packages/effect/src/unstable/sql/SqlStream.ts` at `effect@4.0.0-rc.110` — 81 lines, sole export `asyncPauseResume`, documented as the interop layer used by SQL integrations to implement `Statement.stream` and `Connection.executeStream`.
[^src-migrator]: `packages/effect/src/unstable/sql/Migrator.ts` at `effect@4.0.0-rc.110` — `fromGlob`/`fromRecord` loaders, migrations run inside a transaction, and the concurrency lock is an insert whose failure is inspected with `isConstraintConflict` (`reason._tag === "ConstraintError" || "UniqueViolation"`) and mapped to `MigrationError({ kind: "Locked" })`. Dialect bindings exist for clickhouse, libsql, mssql, mysql2, pg, pglite, sqlite-bun, sqlite-do, sqlite-node, and sqlite-react-native — ten of twelve; d1 and sqlite-wasm ship none.
[^src-sql-connection]: `packages/effect/src/unstable/sql/SqlConnection.ts` at `effect@4.0.0-rc.110` — `Connection` interface and `Acquirer = Effect<Connection, SqlError, Scope>`.
[^src-pg-client]: `packages/sql/pg/src/PgClient.ts` at `effect@4.0.0-rc.110` — `classifyError` branches on SQLSTATE in order (`08*`, `28*`, `42501`, `42*`, `23505`, `23*`, `40P01`, `40001`, `55P03`, `57014`) and falls through to `UnknownError`; span attributes include `db.system.name` and `db.namespace`; `layerFrom`/`layerConfig`/`layer` all return `Layer<PgClient | SqlClient, …>` from a single `make`.
[^src-d1-client]: `packages/sql/d1/src/D1Client.ts` at `effect@4.0.0-rc.110` — `const transactionAcquirer = Effect.die("transactions are not supported in D1")`; `batch` is documented as executing statements "as a single atomic D1 batch"; `updateValues: never`; `executeStream` returns `Stream.die("executeStream not implemented")`, as it does in libsql, mssql, sqlite-bun, sqlite-node, sqlite-react-native, and sqlite-wasm.
[^src-sqlite-do]: `packages/sql/sqlite-do/src/SqliteClient.ts` at `effect@4.0.0-rc.110` — the storage-backed `withTransaction` fails with "Nested transactions are not supported by Cloudflare Durable Object SQLite storage" when a transaction connection is already in context.
[^src-eventlog]: `packages/effect/src/unstable/eventlog/SqlEventLogServerUnencrypted.ts` at `effect@4.0.0-rc.110` — a first-party rc.110 consumer that absorbs an insert race with `Effect.catchIf(isConstraintConflict, () => Effect.void)`, where the predicate reads `error.reason._tag`.
[^src-eventlog-encrypted]: `packages/effect/src/unstable/eventlog/SqlEventLogServerEncrypted.ts` at `effect@4.0.0-rc.110` — the same insert expressed as `sql.insert(batch.entries)` with `ON CONFLICT DO NOTHING`, so no violation is raised.
[^src-effect-catch-reason]: `packages/effect/src/Effect.ts` at `effect@4.0.0-rc.110` — `catchReason(errorTag, reasonTag, f, orElse?)`, `catchReasons(errorTag, cases, orElse?)`, and `unwrapReason(errorTag)`; `retry` accepts `{ while, schedule, times, until }`. The reason machinery is generic over any tagged error carrying a `reason` union, not SQL-specific.
[^docs-sql-basics]: `ai-docs/src/40_sql/10_basics.ts` and `ai-docs/src/40_sql/index.md` at `effect@4.0.0-rc.110` — the only official SQL walkthrough: `Model.Class`, `SqliteMigrator.layer`, `SqlModel.makeRepository`, one `SqlSchema.findAll`, and a repository boundary that maps `NoSuchElementError` to a domain error while dying on `SchemaError` and `SqlError`.
[^test-pg-classification]: `packages/sql/pg/test/SqlErrorClassification.test.ts` at `effect@4.0.0-rc.110` — 23505 yields a trimmed constraint name; missing, non-string, and blank constraints all yield `"unknown"`; 23503 stays a `ConstraintError`.
[^otel-db-spans]: OpenTelemetry semantic conventions `docs/db/database-spans.md` at tag `v1.44.0` — `db.operation.name` and `db.query.text` are Stable; note [15] states non-parameterized query text SHOULD NOT be collected by default without sanitization, and note [16] states parameterized query text SHOULD NOT be sanitized. No `db.transaction.*` event is defined.
[^pg-errcodes]: PostgreSQL 17 documentation, Appendix A — 23505 `unique_violation`, 40001 `serialization_failure`, 40P01 `deadlock_detected`, 55P03 `lock_not_available`, 42501 `insufficient_privilege`, 57014 `query_canceled`; class 08 connection exception, class 28 invalid authorization specification.
[^cf-d1-api]: Cloudflare D1 Worker API documentation — "Batched statements are SQL transactions. If a statement in the sequence fails, then an error is returned for that specific statement, and it aborts or rolls back the entire sequence." Read 2026-08-17; Cloudflare does not version these docs.
[^sqlite-transaction]: SQLite documentation, `lang_transaction.html` — transactions started with `BEGIN` do not nest; `SAVEPOINT`/`RELEASE` are the nesting mechanism, and `ROLLBACK TO` unwinds to a savepoint. Read 2026-08-17; SQLite does not version this page.
[^applied-alchemy-d1]: Observed in alchemy-effect@1596e503 `packages/alchemy/src/SQL/D1.ts` (effect 4.0.0-rc.110) — `Layer.effect(Sql.SqlClient, …).pipe(Layer.provideMerge(Layer.effect(D1Client.D1Client, …)))`, with an in-source comment stating the motive: "so both tags share one per-execution client (and one prepared-statement cache)". The same shape appears in that package's `SQL/Postgres.ts` and `SQL/MySQL.ts`.
[^applied-alchemy-routes]: Observed in alchemy-effect@1596e503 `packages/alchemy/test/SQL/fixtures/routes.ts` (effect 4.0.0-rc.110) — a fixture, but a released library's cross-dialect conformance surface: `sql.unsafe` DDL, `sql(table)` identifiers, single- and multi-row `sql.insert`, `sql.update(row, ["id"])`, `sql.in`, `sql.or` over a nested `sql.and`, prefix-form `sql.csv`, and `sql.literal`.
[^applied-alchemy-lock]: Observed in alchemy-effect@1596e503 `packages/alchemy/src/Auth/Lock.ts` (effect 4.0.0-rc.110) — `Effect.catchReason("PlatformError", "AlreadyExists", …)` converting one reason into a domain failure, then retrying on that domain tag. Not SQL, but the same rc.110 idiom on a reason-carrying error.
[^applied-effect-local-executor]: Observed in effect-local@faa52d9 `packages/local-sql/src/QueryExecutor.ts` (effect 4.0.0-beta.103) — `Effect.catchReasons("SqlError", { ConnectionError, LockTimeoutError, StatementTimeoutError, DeadlockError, SerializationError })` mapping all five to one `StorageUnavailable`, followed by `Effect.catchTag("SqlError", …)` for statement faults; an adjacent comment states the rationale, that holding the list to the reason union makes a renamed reason a build failure instead of a silent reclassification. The same file uses `.compile()` to inspect statement text before execution.
[^applied-effect-local-store]: Observed in effect-local@faa52d9 `packages/local-sql/src/ServerStore.ts` and `SchemaEvolution.ts` (effect 4.0.0-beta.103) — `SqlSchema.findOne` adapters built once at construction; `lockSpace`, a no-op `UPDATE … RETURNING` used as a row lock and only correct inside the caller's transaction; a deliberately nested `sql.withTransaction` whose failure is converted to a `Result` after rollback; and a hand-written schema-evolution engine in place of `Migrator`.
[^applied-opencode-session]: Observed in opencode@65c3597 `packages/effect-drizzle-sqlite/src/effect-sqlite/session.ts` (effect 4.0.0-beta.83) — an independent reimplementation of the same savepoint protocol that additionally issues `release savepoint effect_sql_<id>` on nested success. Note on version: no production `withTransaction` usage exists in the corpus at rc.110, so this section's "how people write it today" support is beta-era. The mechanism claim is unaffected — `makeWithTransaction` is byte-identical in shape across beta.83, beta.103, and rc.110, and this reimplementation matches it line for line except for the release.
