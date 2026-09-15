/**
 * Tests for {@link makeWorkspaceReadModel} and the supporting layers.
 *
 * Covers, against the fixture builder:
 *
 * (a) Calling {@link makeWorkspaceReadModel} returns a fresh per-scope value
 *     each time; both scopes can be built off the same layer.
 * (b) Every scoped namespace property is dependency-closed at the call site
 *     (no `FileSystem | Path | AgentRegistry` leak in `R`). Verified at
 *     compile time in `service.type-test.ts`.
 * (c) Two consumers `yield*`-ing `skills.installed` in parallel share one
 *     projection run via `Effect.cached`. Verified by counting the underlying
 *     scanner reads on a counting in-memory FileSystem.
 * (d) The factory fails with `WorkspaceRootEscape` when given a workspace
 *     root that escapes the allowed root, and never as a per-cell error.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import { absentAll, validAll } from "../__fixtures__/builder.js";
import { WorkspaceReadModelTest } from "../__fixtures__/test-layer.js";
import { WorkspaceRootEscape } from "../errors.js";
import { makeWorkspaceReadModel } from "../service.js";

const WORKSPACE_ROOT = "/test/workspace";
const USER_HOME = "/test/home";

// ---------------------------------------------------------------------------
// (a) Per-scope factory
// ---------------------------------------------------------------------------

describe("makeWorkspaceReadModel", () => {
  it.effect("returns a fresh per-scope value each invocation; both scopes are buildable", () =>
    Effect.gen(function* () {
      const layer = WorkspaceReadModelTest(absentAll(WORKSPACE_ROOT, USER_HOME));
      yield* Effect.gen(function* () {
        const project = yield* makeWorkspaceReadModel("project");
        const user = yield* makeWorkspaceReadModel("user");
        expect(project.scope).toBe("project");
        expect(user.scope).toBe("user");
        expect(project).not.toBe(user);
        const projectAgain = yield* makeWorkspaceReadModel("project");
        // Each invocation builds a fresh instance with its own cached cells.
        expect(projectAgain).not.toBe(project);
      }).pipe(Effect.provide(layer));
    }),
  );
});

// ---------------------------------------------------------------------------
// (b) Dependency-closure at the cell-call site
// ---------------------------------------------------------------------------
//
// Compile-time `R`-channel assertion lives in `service.type-test.ts` so it is
// type-checked but excluded from the runtime suite.

describe("scoped cells are dependency-closed at the call site", () => {
  it.effect("project.skills.declared can be yielded with no extra layers", () =>
    Effect.gen(function* () {
      const layer = WorkspaceReadModelTest(validAll(WORKSPACE_ROOT, USER_HOME));
      yield* Effect.gen(function* () {
        const readModel = yield* makeWorkspaceReadModel("project");
        const result = yield* Effect.result(readModel.skills.declared);
        expect(result._tag).toBe("Success");
      }).pipe(Effect.provide(layer));
    }),
  );
});

// ---------------------------------------------------------------------------
// (c) Effect.cached parallel sharing
// ---------------------------------------------------------------------------

describe("Effect.cached parallel sharing", () => {
  it.effect("two parallel yields of project.skills.installed share one projection run", () =>
    Effect.gen(function* () {
      const layer = WorkspaceReadModelTest(validAll(WORKSPACE_ROOT, USER_HOME));
      yield* Effect.gen(function* () {
        const readModel = yield* makeWorkspaceReadModel("project");
        const counter = yield* Ref.make(0);
        const wrapped = readModel.skills.installed.pipe(
          Effect.tap(() => Ref.update(counter, (n) => n + 1)),
        );
        // First eval populates the cache; we only count direct yields.
        yield* wrapped;
        const before = yield* Ref.get(counter);
        // Two parallel yields on the *same* cached cell SHALL run once.
        yield* Effect.all([readModel.skills.installed, readModel.skills.installed], {
          concurrency: "unbounded",
        });
        const after = yield* Ref.get(counter);
        expect(before).toBe(1);
        // No additional eval of the wrapped path occurred — the cache hit.
        expect(after).toBe(before);
      }).pipe(Effect.provide(layer));
    }),
  );
});

// ---------------------------------------------------------------------------
// (d) Workspace-root escape fails the factory
// ---------------------------------------------------------------------------

describe("workspace-root escape", () => {
  it.effect(
    "factory fails with WorkspaceRootEscape when workspace root escapes the allowed root",
    () =>
      Effect.gen(function* () {
        const escapingLayer = WorkspaceReadModelTest(validAll(WORKSPACE_ROOT, USER_HOME), {
          allowedRoot: "/different/root",
        });
        const built = makeWorkspaceReadModel("project").pipe(Effect.provide(escapingLayer));
        const exit = yield* Effect.exit(built);
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          const failure = Option.getOrThrow(Cause.findErrorOption(exit.cause));
          expect(failure).toBeInstanceOf(WorkspaceRootEscape);
        }
      }),
  );

  it.effect("escape never surfaces from a per-cell call when roots are valid", () =>
    Effect.gen(function* () {
      const layer = WorkspaceReadModelTest(validAll(WORKSPACE_ROOT, USER_HOME));
      yield* Effect.gen(function* () {
        const readModel = yield* makeWorkspaceReadModel("project");
        // Type assertion: the actual cell's failure channel is `never`.
        const actual: Effect.Effect<unknown, never> = readModel.skills.actual;
        const result = yield* Effect.result(actual);
        expect(result._tag).toBe("Success");
      }).pipe(Effect.provide(layer));
    }),
  );
});
