/**
 * Cross-scope agent-root resolver service.
 *
 * Wraps the {@link AgentRootResolverState} and the snapshot of warnings
 * emitted by {@link detectAgentRootCollisions}. Sharing one resolver across
 * the per-scope factory ensures the heuristic-fallback warning fires at most
 * once per agent across both scopes and both `mcp-config` / `agent-settings`
 * scanners. Collision detection runs once at layer construction and exposes
 * its warnings as an eager snapshot the project-scope read model seeds into
 * its diagnostics buffer.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { AGENTS } from "../../agents/registry.js";
import { makeDiagnostics, type Warning } from "./diagnostics.js";
import {
  detectAgentRootCollisions,
  makeAgentRootResolverState,
  type AgentRootResolverState,
} from "./scanners/agent-root.js";

/** Public shape of the {@link AgentRootResolver} service. */
export interface AgentRootResolverShape {
  /** Shared resolver state passed to scanners that resolve agent roots. */
  readonly state: AgentRootResolverState;
  /**
   * Snapshot of `scanner-config` warnings produced by
   * {@link detectAgentRootCollisions} at layer construction. The project
   * scope seeds these into its diagnostics buffer; the user scope does not.
   */
  readonly collisionWarnings: ReadonlyArray<Warning>;
}

/** Service tag for the cross-scope agent-root resolver. */
export class AgentRootResolver extends ServiceMap.Service<
  AgentRootResolver,
  AgentRootResolverShape
>()("axm/WorkspaceReadModel/AgentRootResolver") {}

/**
 * Live layer for {@link AgentRootResolver}. Allocates the shared state and
 * runs collision detection once when the layer is built.
 */
export const AgentRootResolverLive: Layer.Layer<AgentRootResolver, never, Path.Path> = Layer.effect(
  AgentRootResolver,
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const state = makeAgentRootResolverState();
    const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
    yield* detectAgentRootCollisions(path, Object.values(AGENTS), makeDiagnostics(ref));
    const collisionWarnings = yield* Ref.get(ref);
    return AgentRootResolver.of({ state, collisionWarnings });
  }).pipe(Effect.withSpan("workspace.read-model.agent-root-resolver.build")),
);
