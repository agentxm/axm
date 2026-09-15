/**
 * Regression tests for {@link AgentRootResolver}.
 *
 * The resolver service exists so cross-scope state — agent-root collision
 * warnings and the heuristic-fallback dedup set — survives the per-scope
 * factory shape. These tests pin the two invariants:
 *
 * 1. Building both scopes against the same layer surfaces collision warnings
 *    on the project scope only (no duplicate seeding on the user scope).
 * 2. The heuristic-fallback warning fires at most once per agent across both
 *    scopes and both `mcp-config` and `agent-settings` scanners.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { AgentRootResolver, AgentRootResolverLive } from "../agent-root-resolver.js";
import { absentAll } from "../__fixtures__/builder.js";
import { WorkspaceReadModelTest } from "../__fixtures__/test-layer.js";
import { makeWorkspaceReadModel } from "../service.js";

const WORKSPACE_ROOT = "/test/workspace";
const USER_HOME = "/test/home";

describe("AgentRootResolver layer", () => {
  it.effect("layer construction emits a stable collisionWarnings snapshot", () =>
    Effect.gen(function* () {
      const layer = AgentRootResolverLive.pipe(Layer.provide(Path.layer));
      const program = Effect.gen(function* () {
        const a = yield* AgentRootResolver;
        const b = yield* AgentRootResolver;
        // Same layer ⇒ same value ⇒ same warnings array reference.
        expect(a.collisionWarnings).toBe(b.collisionWarnings);
        expect(a.state).toBe(b.state);
      }).pipe(Effect.provide(layer));
      yield* program;
    }),
  );
});

describe("cross-scope dedup", () => {
  it.effect("project scope receives collision warnings; user scope does not", () =>
    Effect.gen(function* () {
      const layer = WorkspaceReadModelTest(absentAll(WORKSPACE_ROOT, USER_HOME));
      yield* Effect.gen(function* () {
        const project = yield* makeWorkspaceReadModel("project");
        const user = yield* makeWorkspaceReadModel("user");
        const projectWarnings = yield* project.diagnostics;
        const userWarnings = yield* user.diagnostics;
        const userCollision = userWarnings.filter((w) =>
          w.message.startsWith("agent-root: collision"),
        );
        // No collision warnings leak into the user scope.
        expect(userCollision).toEqual([]);
        // Collision warnings, if any, only appear on the project scope.
        const projectCollision = projectWarnings.filter((w) =>
          w.message.startsWith("agent-root: collision"),
        );
        for (const warning of projectCollision) {
          expect(warning.code).toBe("scanner-config");
        }
      }).pipe(Effect.provide(layer));
    }),
  );

  it.effect("heuristic-fallback warnings dedupe across scopes via the shared resolver state", () =>
    Effect.gen(function* () {
      // Build both scopes against the same layer; the resolver's heuristic
      // dedup set is shared, so any per-agent heuristic warning fires once
      // across both scopes' scanner reads.
      const layer = WorkspaceReadModelTest(absentAll(WORKSPACE_ROOT, USER_HOME));
      yield* Effect.gen(function* () {
        const project = yield* makeWorkspaceReadModel("project");
        const user = yield* makeWorkspaceReadModel("user");
        // Drive every scanner that consults `agentRootSegment`.
        yield* project.mcpServers.actual;
        yield* project.agents.detected;
        yield* user.mcpServers.actual;
        yield* user.agents.detected;
        const all = [...(yield* project.diagnostics), ...(yield* user.diagnostics)];
        const heuristicFallbacks = all.filter((w) =>
          w.message.startsWith("agent-root: descriptor"),
        );
        // No agent should see its heuristic-fallback warning more than once
        // across both scopes.
        const counts = new Map<string, number>();
        for (const w of heuristicFallbacks) {
          counts.set(w.message, (counts.get(w.message) ?? 0) + 1);
        }
        for (const [, count] of counts) {
          expect(count).toBe(1);
        }
      }).pipe(Effect.provide(layer));
    }),
  );
});
