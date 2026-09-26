/**
 * Compile-time type assertion for the no-network spec.
 *
 * Cells yielded from a {@link WorkspaceReadModel} carry no
 * `FileSystem`/`Path`/`AgentRegistry`/network requirement in their `R`
 * channel — the factory closes over its dependencies during construction.
 * Any future introduction of a network service requirement (`HttpClient`,
 * `RegistryClient`, etc.) surfaces here as a type error.
 *
 * Excluded from vitest's runtime suite; included in `tsconfig.spec.json` so
 * the assertion is checked when typecheck runs.
 */

import * as Effect from "effect/Effect";
import { makeWorkspaceReadModel } from "../../service.js";

type _CellR<T> = T extends Effect.Effect<infer _A, infer _E, infer R> ? R : never;

const _probe = Effect.gen(function* () {
  const readModel = yield* makeWorkspaceReadModel("project");
  yield* readModel.skills.installed;
  yield* readModel.skills.declared;
  yield* readModel.skills.resolved;
  yield* readModel.state.settings;
  yield* readModel.sourceHosts.declared;
});

type _ProbeR = _CellR<typeof _probe>;

export type _Refs = [typeof _probe, _ProbeR];
