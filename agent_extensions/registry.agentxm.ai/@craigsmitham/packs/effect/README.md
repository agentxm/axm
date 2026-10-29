# Effect

The `effect` pack and knowledge bundle and the `use-effect` rule start their
renamed release line at
`4.0.0`. Their major versions track the supported Effect major; minor and
patch versions advance independently from upstream releases. The pack keeps
both member dependencies within the 4.x line.

This pack installs two members:

- `@craigsmitham/rules/use-effect` — requires Effect v4 as the foundation for
  all TypeScript, including scripts, and incremental migration of relevant
  existing code with each change. By default, installing this pack activates
  that adoption policy throughout the rule's workspace scope.
- `@craigsmitham/knowledge/effect` — a standalone OKF 0.2 bundle of
  twenty-four concise checklists for design, implementation, maintenance, and
  review.

For checklists without the adoption rule, install the standalone bundle with
`axm knowledge install @craigsmitham/knowledge/effect` instead of the pack.

The checklists require **Effect 4.1.0 or newer within major version 4** and were
last reviewed against **4.1.0**. Pack `4.1.0` requires knowledge bundle `4.1.0`
or newer; the unchanged adoption rule remains compatible with Effect 4.0.0.
See the [bundle index](https://github.com/craigsmitham/agent-extensions/blob/main/knowledge/effect/src/index.md)
for the complete topic list and the major-version policy.

The former `@craigsmitham/skills/craft-effect-v4` routing skill is not part of
this pack. Consult a topic checklist directly when it is useful.

## Migrating from the previous names

| Previous identity | Replacement |
| --- | --- |
| `@craigsmitham/packs/effect-v4` | `@craigsmitham/packs/effect` |
| `@craigsmitham/knowledge/effect-v4` | `@craigsmitham/knowledge/effect` |
| `@craigsmitham/rules/use-effect-v4` | `@craigsmitham/rules/use-effect` |

For an installed Registry pack, preview the migration with
`axm migrate @craigsmitham/packs/effect-v4 --preview`, then run the same command
without `--preview` to apply it. For an independently installed knowledge
bundle or rule, use that previous identity instead. The replacements continue
to target Effect 4.x; the rename does not change the rule's adoption policy or
the twenty-four checklists.

## Companion packages

The pack and knowledge manifests recommend these official packages with the
compatibility range `>=4.1.0 <5.0.0`, using AXM's `packages` metadata. These
recommendations do not install npm dependencies. Choose only the adapters and
tools needed by the application, and keep their versions aligned with core
Effect as described in the [official package list](https://github.com/Effect-TS/effect/blob/effect%404.1.0/README.md#packages).
The common minimum reflects the reviewed 4.1.0 release family and the APIs
used by the checklists. It is not a claim that
every adapter runs on every platform or that future releases have been tested.

| Use | Packages |
| --- | --- |
| Core APIs and conventions | `effect` |
| Runtime services | `@effect/platform-browser`, `@effect/platform-bun`, `@effect/platform-deno`, `@effect/platform-node`; `@effect/platform-node-shared` for shared Node-compatible implementations |
| SQL databases | `@effect/sql-clickhouse`, `@effect/sql-libsql`, `@effect/sql-mssql`, `@effect/sql-mysql2`, `@effect/sql-pg`, `@effect/sql-pglite` |
| SQLite by runtime | `@effect/sql-sqlite-bun`, `@effect/sql-sqlite-node`, `@effect/sql-sqlite-react-native`, `@effect/sql-sqlite-wasm` |
| Cloudflare databases | `@effect/sql-d1`, `@effect/sql-sqlite-do` |
| Telemetry | `@effect/opentelemetry` |
| Vitest integration | `@effect/vitest` |
| Code generation from OpenAPI contracts | `@effect/openapi-generator` |

These packages match the bundle's current topics. Revisit the selection when
adding topics or changing the supported Effect major.

## Checklist maintenance

The bundle index owns [scope and inclusion](https://github.com/craigsmitham/agent-extensions/blob/main/knowledge/effect/src/index.md#scope-and-inclusion).
Use those criteria when deciding whether to extend a topic or add one.

Before revising a checklist, inspect current Effect v4 source and tests plus
representative v4 applications or libraries that exercise the topic. Record
each reference's role, declared Effect version, and reviewed commit. Prefer
small excerpts with relevant tests; verify the specific behavior before moving
a source pin. The reference selection reviewed on 2026-10-27 is:

- [Effect](https://github.com/Effect-TS/effect) — released API contracts,
  regression tests, and idiomatic examples; release baseline refreshed to 4.1.0
  on 2026-10-29. Applied snapshots below retain their 2026-10-27 review dates.
- [opencode](https://github.com/anomalyco/opencode) — application services,
  Bun test harness, and concurrency tests; catalog 4.0.1. Its
  [HTTP recorder](https://github.com/anomalyco/opencode/tree/432d870b02683d2e40e895ddc70d437189b25276/packages/http-recorder)
  supplies the current client-decoration reference.
- [LiveStore](https://github.com/livestorejs/livestore) — worker ownership and
  interoperability; catalog 4.0.3. Its Effect facade is project-specific.
- [Alchemy](https://github.com/alchemy-run/alchemy) — infrastructure service
  implementations and platform adapters; catalog ^4.0.5, overrides 4.0.5.
  Distinguish presentation demos and native async Workers from Effect service
  style examples.
- [effect-local](https://github.com/lucas-barake/effect-local) — protocol
  boundaries and replica ownership; development 4.0.0, library peer ~4.0.0.
- [dfx](https://github.com/tim-smart/dfx) — library services and untraced
  functions; development ^4.0.5, peer ^4.0.0.

The standalone [effect-http-recorder](https://github.com/anomalyco/effect-http-recorder)
repository is historical beta.83 evidence. Prefer the integrated opencode
package for current examples. A repository's use of a pattern does not make
every detail a general convention: retain the bundle's clock, schema,
cancellation, and observability requirements, and justify custom facades or
layer graphs by a concrete repeated need.

Keep each topic to five through ten independently judgeable items. Link to API
detail and extended guidance rather than turning a checklist back into a guide.
