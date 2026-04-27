/**
 * Compile-time type assertions for the WorkspaceContext public surface.
 *
 * Pure type-level. Excluded from vitest's runtime suite; included in
 * `tsconfig.spec.json` so the assertions are checked when typecheck runs.
 *
 * Each `WorkspaceContext.scope(...)` cell carries only `WorkspaceContext` in
 * its `R` channel. Any future introduction of a `FileSystem`, `Path`, or
 * `AgentRegistry` requirement leaking through a scoped cell surfaces here as
 * a type error.
 */

import * as Effect from "effect/Effect";
import { WorkspaceContext } from "../context.js";

type _CellR<T> = T extends Effect.Effect<infer _A, infer _E, infer R> ? R : never;

const _program = Effect.gen(function* () {
  const ctx = yield* WorkspaceContext;
  const p = ctx.scope("project");
  yield* p.skills.declared;
  yield* p.skills.resolved;
  yield* p.skills.actual;
  yield* p.skills.installed;
  yield* p.commands.installed;
  yield* p.mcpServers.installed;
  yield* p.subagents.installed;
  yield* p.files.installed;
  yield* p.rules.installed;
  yield* p.packs.installed;
  yield* p.agents.list;
  yield* p.agents.detected;
  yield* p.state.settings;
  yield* p.state.lockfile;
  yield* p.sourceHosts.declared;
  yield* p.profile.declared;
  yield* p.diagnostics;
});

type _ProgramR = _CellR<typeof _program>;
type _NoFsLeak = [Exclude<_ProgramR, WorkspaceContext>] extends [never] ? true : false;
const _noFsLeak = true as const satisfies _NoFsLeak;

export type _Refs = [typeof _program, typeof _noFsLeak];
