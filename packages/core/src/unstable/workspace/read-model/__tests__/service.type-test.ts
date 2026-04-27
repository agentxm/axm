/**
 * Compile-time type assertions for the WorkspaceReadModel public surface.
 *
 * Pure type-level. Excluded from vitest's runtime suite; included in
 * `tsconfig.spec.json` so the assertions are checked when typecheck runs.
 *
 * Each `WorkspaceReadModel.scope(...)` cell carries only `WorkspaceReadModel` in
 * its `R` channel. Any future introduction of a `FileSystem`, `Path`, or
 * `AgentRegistry` requirement leaking through a scoped cell surfaces here as
 * a type error.
 */

import * as Effect from "effect/Effect";
import { WorkspaceReadModel } from "../service.js";

type _CellR<T> = T extends Effect.Effect<infer _A, infer _E, infer R> ? R : never;

const _program = Effect.gen(function* () {
  const readModel = yield* WorkspaceReadModel;
  const p = readModel.scope("project");
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
  yield* p.profile.declared;
  yield* p.diagnostics;
});

type _ProgramR = _CellR<typeof _program>;
type _NoFsLeak = [Exclude<_ProgramR, WorkspaceReadModel>] extends [never] ? true : false;
const _noFsLeak = true as const satisfies _NoFsLeak;

export type _Refs = [typeof _program, typeof _noFsLeak];
