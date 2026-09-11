import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { TestFlagsLayer } from "./cli-flags/index.js";
import { TestRenderer } from "./test-support/presenter-test.js";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { WorkspaceTransactionScope } from "@agentxm/workspace-transactions";
import * as Option from "effect/Option";

import { makeBaseWorkspaceMock } from "./test-support/test-stubs.js";
import { withLiveOperation, withOperationLifecycle } from "./operation-lifecycle.js";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import { OperationLifecycle, observeUnit } from "@agentxm/workspace-operations";

let tempDir: string;

beforeEach(() => {
  tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-operation-lifecycle-"));
});

afterEach(() => {
  nodeFs.rmSync(tempDir, { recursive: true, force: true });
});

describe("withOperationLifecycle", () => {
  // A resolution produced before the journal exists reports what was
  // requested, never a hardcoded apply/closure-atomic claim: an interrupted
  // preview stays a preview, and a non-rollbackable family keeps its
  // declared atomicity.
  it.effect("an interrupted operation settles exactly once for every observer", () =>
    Effect.gen(function* () {
      const renderer = TestRenderer.make();
      const started = yield* Deferred.make<void>();
      const fiber = yield* withLiveOperation(
        { command: "install", name: "Install skill", mode: "apply" },
        observeUnit(
          { id: "skill:one", label: "one", total: 1 },
          Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
        ),
      ).pipe(Effect.provide(renderer.layer), Effect.forkChild);
      yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);

      const tags = renderer.state.events.map((event) => event._tag);
      expect(tags).toEqual(["OperationStarted", "UnitStarted", "UnitResolved", "OperationSettled"]);
      expect(renderer.state.events.filter((event) => event._tag === "OperationSettled")).toEqual([
        expect.objectContaining({ outcome: "interrupted", seq: 4 }),
      ]);
      expect(renderer.state.events[2]).toMatchObject({ state: "interrupted" });
    }),
  );

  it.effect("provides the lifecycle to the body and settles success as completed", () =>
    Effect.gen(function* () {
      const renderer = TestRenderer.make();
      const seen = yield* withLiveOperation(
        { command: "cache.status", name: "Inspect archive cache", mode: "preview" },
        Effect.map(Effect.serviceOption(OperationLifecycle), (service) => service._tag === "Some"),
      ).pipe(Effect.provide(renderer.layer));
      expect(seen).toBe(true);
      expect(renderer.state.events.map((event) => event._tag)).toEqual([
        "OperationStarted",
        "OperationSettled",
      ]);
      expect(renderer.state.events.at(-1)).toMatchObject({ outcome: "completed" });
    }),
  );

  // Lock lifetime is a design invariant, not a contract obligation, so this
  // test carries no obligation ID.
  it.effect("does not hold the workspace transition before the body confirms", () =>
    Effect.gen(function* () {
      const workspaceDir = nodePath.join(tempDir, ".axm");
      const resolved = nodePath.resolve(workspaceDir);
      const renderer = TestRenderer.make();
      // Planning, registry acquisition, preview, and the confirmation
      // decision all run inside the body; holding the workspace transition
      // across them lets a slow download or an open prompt monopolize the
      // workspace. The transition is acquired only after confirmation, for
      // revalidation through apply.
      let heldAtBodyStart: boolean | undefined;
      yield* withOperationLifecycle(
        { command: "update", mode: "apply", planName: "Update extensions" },
        Effect.gen(function* () {
          const scope = yield* WorkspaceTransactionScope;
          heldAtBodyStart = Option.isSome(yield* scope.lock.held(resolved));
        }),
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            NodeServices.layer,
            renderer.layer,
            TestFlagsLayer({ nonInteractive: true }),
            WorkspaceMutations.layer(makeBaseWorkspaceMock(workspaceDir)),
            WorkspaceTransactionScope.layer({
              workspaceDir,
              settingsPath: nodePath.join(nodePath.dirname(workspaceDir), "axm.json"),
              lockPath: nodePath.join(nodePath.dirname(workspaceDir), "axm-lock.yaml"),
            }),
          ),
        ),
      );
      expect(heldAtBodyStart).toBe(false);
    }),
  );
});
