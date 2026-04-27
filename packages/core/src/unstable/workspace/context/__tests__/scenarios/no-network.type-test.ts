/**
 * Compile-time type assertion for the no-network spec.
 *
 * Cells yielded from `WorkspaceContext` carry only `WorkspaceContext` in their
 * `R` channel. Any future introduction of a network service requirement
 * (HttpClient, RegistryClient, etc.) surfaces here as a type error.
 *
 * Excluded from vitest's runtime suite; included in `tsconfig.spec.json` so
 * the assertion is checked when typecheck runs.
 */

import * as Effect from "effect/Effect";
import { WorkspaceContext } from "../../context.js";

type _CellR<T> = T extends Effect.Effect<infer _A, infer _E, infer R> ? R : never;

const _probe = Effect.gen(function* () {
  const ctx = yield* WorkspaceContext;
  yield* ctx.scope("project").skills.installed;
  yield* ctx.scope("project").skills.declared;
  yield* ctx.scope("project").skills.resolved;
  yield* ctx.scope("project").state.settings;
  yield* ctx.scope("project").sourceHosts.declared;
});

type _ProbeR = _CellR<typeof _probe>;
export type _OnlyContextRequired = [Exclude<_ProbeR, WorkspaceContext>] extends [never]
  ? true
  : false;
const _typeCheck: _OnlyContextRequired = true;

export type _Refs = [typeof _probe, typeof _typeCheck];
