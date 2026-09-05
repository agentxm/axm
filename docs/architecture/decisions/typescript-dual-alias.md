---
type: Decision
status: stable
description: The accepted decision to type check on the native TypeScript 7 compiler while `typescript` resolves to the TypeScript 6 compatibility package, exiting at TypeScript 7.1.
---

# Dual TypeScript alias toolchain

## Context and forces

The repository type checks with the native TypeScript 7 compiler: every
`typecheck` target — including the root `axm` project's, which checks the
repository tooling under `scripts/` — runs `tsc` as TypeScript 7, patched by
`@effect/tsgo` so it enforces the `@effect/language-service` diagnostics.
Three forces prevent a single `typescript` dependency from serving every
consumer:

- TypeScript 7.0 ships no stable compiler API, so programmatic consumers —
  typescript-eslint and the in-process Nx executors — cannot run on the native
  TypeScript 7 package.
- The build produces the published contract: `@nx/js:tsc` compiles in-process,
  and `dist/**/*.d.ts` is the published artifact contract, so the build must
  stay on an engine the in-process executor can run on.
- Editors need a working language server; Microsoft's TypeScript 6
  compatibility package ships no `tsserver.js`, so "Use Workspace Version"
  cannot point at `node_modules/typescript`.

## Accepted choice

A deliberate dual alias in the pnpm catalog:

- `tsc` is TypeScript 7, the native compiler, aliased as `@typescript/native`
  (currently `npm:typescript@^7.0.2`), patched by `@effect/tsgo` — applied by
  the repository `prepare` script — so it enforces the
  `@effect/language-service` diagnostics. Every `typecheck` target runs on it,
  including the root `axm` project's `tsc -p scripts/tsconfig.json --noEmit`.
- `require("typescript")` resolves to Microsoft's TypeScript 6 compatibility
  package (currently `npm:@typescript/typescript6@^6.0.2`), keeping
  typescript-eslint and the in-process Nx executors working.
- `build` stays on TypeScript 6 and moves only once `@nx/js:tsc` can run on
  the TypeScript 7 engine.
- The TypeScript 6 CLI remains installed as `tsc6` for one-off checks.
- Editors use the patched TypeScript 7 language server
  (`typescript.experimental.useTsgo`).

Accepting authority: maintainer approval through the repository pull-request
workflow.

## Rationale

The dual alias is the only arrangement that satisfies all three forces at
once: type checking runs on the native TypeScript 7 compiler with the Effect
language-service diagnostics enforced, programmatic consumers keep the stable
TypeScript 6 compiler API they require, and the published `dist/**/*.d.ts`
contract continues to be produced by the in-process build. The split is
explicitly temporary, with TypeScript 7.1 as the exit point.

## Material alternatives

- **Single TypeScript 6 dependency (defer native adoption until
  TypeScript 7.1).** Every programmatic consumer and the build keep working
  with no dual arrangement, but type checking forgoes the native TypeScript 7
  compiler and the `@effect/tsgo`-enforced `@effect/language-service`
  diagnostics for the whole interim. Rejected: the checking value is wanted
  now, and the bridge cost is bounded by the named exit.
- **Single TypeScript 7 dependency.** Type checking is native, but
  TypeScript 7.0 ships no stable compiler API, so typescript-eslint and the
  in-process Nx executors stop working and the published `dist/**/*.d.ts`
  build contract loses its compiler. Rejected: the stable compiler API the
  programmatic consumers and the in-process build require does not exist in
  TypeScript 7.0.
- **TypeScript 7 unpatched (no `@effect/tsgo`).** Adopts the native compiler
  without the patch step, but `tsc` would no longer enforce the
  `@effect/language-service` diagnostics during type checking. Rejected:
  enforcement during typecheck is the point of the arrangement.

## Consequences

Positive:

- Every `typecheck` target, repository tooling included, runs on the native
  TypeScript 7 compiler with `@effect/language-service` diagnostics enforced.
- typescript-eslint and the in-process Nx executors keep a working, stable
  compiler API.
- The published `dist/**/*.d.ts` contract continues to be produced by the
  proven in-process TypeScript 6 build.

Negative:

- Two TypeScript versions must be kept coherent in the pnpm catalog, and
  contributors must know that `tsc` and `require("typescript")` are different
  compilers.
- The `@effect/tsgo` patch is load-bearing and must remain applied through the
  repository `prepare` script.
- Editor configuration must opt into the patched TypeScript 7 language server
  (`typescript.experimental.useTsgo`); the compatibility package ships no
  `tsserver.js`, so "Use Workspace Version" cannot point at
  `node_modules/typescript`.
- One-off TypeScript 6 CLI checks go through `tsc6` instead of `tsc`.

Binding limitation: the dual alias must not be collapsed to a single
`typescript` dependency before the exit condition. That obligation is owned by
the executable specification `system/process/dual-typescript-alias-retained`
in the [specification catalog](../../../specifications/catalog.md); this
record owns the choice, rationale, and exit condition, not the obligation
itself.

## Supersession and reconsideration

**Exit condition (owned by this record): TypeScript 7.1.** Supersede this
record when TypeScript 7.1 (or a later release) removes the need for the
compatibility split, allowing the repository to collapse to a single
TypeScript dependency; the superseding change retires the companion
specification through the same reviewed requirement diff.

Reconsider earlier when any of the following occurs:

- `@nx/js:tsc` can run on the TypeScript 7 engine — the build may move off
  TypeScript 6 before the full exit, weakening a load-bearing force;
- the programmatic consumers named in the context no longer require the
  TypeScript 6 compatibility package; or
- the `@effect/tsgo` patching arrangement or the `@effect/language-service`
  integration materially changes.

Also reconsider when a material assumption is invalidated, evidence
contradicts an intended consequence, or the tradeoff no longer fits AXM's
lifecycle or assurance posture. When superseded, this record remains reachable
and links its replacement.
