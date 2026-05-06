/**
 * Compile-time type assertions for the workspace read-model public surface.
 *
 * Pure type-level. Excluded from vitest's runtime suite; included in
 * `tsconfig.spec.json` so the assertions are checked when typecheck runs.
 *
 * Each cell yielded from a {@link WorkspaceReadModel} carries no
 * `FileSystem`, `Path`, or `AgentRegistry` requirement in its `R` channel —
 * the factory closes over its dependencies during construction. Any future
 * leak surfaces here as a type error.
 */

import * as Effect from "effect/Effect";
import { makeWorkspaceReadModel } from "../service.js";

type _CellR<T> = T extends Effect.Effect<infer _A, infer _E, infer R> ? R : never;

const _program = Effect.gen(function* () {
  const p = yield* makeWorkspaceReadModel("project");
  yield* p.skills.declared;
  yield* p.skills.resolved;
  yield* p.skills.actual;
  yield* p.skills.installed;
  yield* p.skills.byName("example");
  yield* p.skills.declaredByName("example");
  yield* p.commands.installed;
  yield* p.commands.byName("example");
  yield* p.commands.declaredByName("example");
  yield* p.mcpServers.installed;
  yield* p.mcpServers.byName("example");
  yield* p.mcpServers.declaredByName("example");
  yield* p.subagents.installed;
  yield* p.subagents.byName("example");
  yield* p.subagents.declaredByName("example");
  yield* p.files.installed;
  yield* p.files.byName("example");
  yield* p.files.declaredByName("example");
  yield* p.rules.installed;
  yield* p.rules.byName("example");
  yield* p.rules.declaredByName("example");
  yield* p.packs.installed;
  yield* p.packs.byName("example");
  yield* p.packs.declaredByName("example");
  yield* p.agents.list;
  yield* p.agents.known;
  p.agents.byId("codex");
  yield* p.agents.detected;
  yield* p.state.settings;
  yield* p.state.lockfile;
  yield* p.sourceHosts.declared;
  yield* p.owner;
  yield* p.diagnostics;
});

type _ProgramR = _CellR<typeof _program>;

export type _Refs = [typeof _program, _ProgramR];
