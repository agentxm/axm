/**
 * Compile-time type assertion for the no-network spec.
 *
 * Cells yielded from `WorkspaceReadModel` carry only `WorkspaceReadModel` in their
 * `R` channel. Any future introduction of a network service requirement
 * (HttpClient, RegistryClient, etc.) surfaces here as a type error.
 *
 * Excluded from vitest's runtime suite; included in `tsconfig.spec.json` so
 * the assertion is checked when typecheck runs.
 */

import * as Effect from "effect/Effect";
import { WorkspaceReadModel } from "../../service.js";

type _CellR<T> = T extends Effect.Effect<infer _A, infer _E, infer R> ? R : never;

const _probe = Effect.gen(function* () {
  const readModel = yield* WorkspaceReadModel;
  yield* readModel.scope("project").skills.installed;
  yield* readModel.scope("project").skills.declared;
  yield* readModel.scope("project").skills.resolved;
  yield* readModel.scope("project").state.settings;
  yield* readModel.scope("project").sourceHosts.declared;
});

type _ProbeR = _CellR<typeof _probe>;
export type _OnlyContextRequired = [Exclude<_ProbeR, WorkspaceReadModel>] extends [never]
  ? true
  : false;
const _typeCheck: _OnlyContextRequired = true;

export type _Refs = [typeof _probe, typeof _typeCheck];
