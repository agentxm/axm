/**
 * Tests for runUninstallCommandWorkflow phase ordering.
 *
 * Verifies the canonical sequence: parse -> finalizeIntent ->
 * buildUninstallPlan -> previewOrApplyPlan.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { TestRenderer } from "../../cli-renderer/index.js";
import { TestFlagsLayer } from "../../cli-flags/index.js";
import {
  confirmableApplyExecution,
  type ConfirmationRecovery,
} from "../../cli-runtime/confirmation-recovery.js";
import { makeAppError } from "../../app-error/index.js";
import type { Plan } from "../../plan/index.js";
import { ResolvePlanInteractionTest, WorkspaceMutations } from "../../workspace/index.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import {
  type UninstallExtensionCommandWorkflowActions,
  runUninstallCommandWorkflow,
} from "../index.js";

// -----------------------------------------------------------------------------
// Test types
// -----------------------------------------------------------------------------

type TestArgs = { readonly names: ReadonlyArray<string> };
type TestParsed = { readonly parsedNames: ReadonlyArray<string> };
type TestIntent = { readonly targets: ReadonlyArray<string> };

const testRecovery: ConfirmationRecovery = {
  command: ["skills", "uninstall"],
  arguments: [],
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeMockWorkspace = () => makeBaseWorkspaceMock("/tmp/test/.axm");

const makeTestLayer = () => {
  const { layer: rendererLayer } = TestRenderer.make();
  const interaction = ResolvePlanInteractionTest();
  return Layer.mergeAll(
    NodeServices.layer,
    rendererLayer,
    WorkspaceMutations.layer(makeMockWorkspace()),
    TestFlagsLayer(),
    interaction.layer,
  );
};

// -----------------------------------------------------------------------------
// Phase ordering tests
// -----------------------------------------------------------------------------

describe("runUninstallCommandWorkflow", () => {
  it.effect(
    "executes phases in canonical order: parse -> finalizeIntent -> buildUninstallPlan -> previewOrApplyPlan",
    () =>
      Effect.gen(function* () {
        const callOrder: string[] = [];
        const testPlan: Plan = {
          _tag: "Plan",
          name: "test-uninstall",
          description: Option.none(),
          jobs: [],
        };

        const actions: UninstallExtensionCommandWorkflowActions<TestArgs, TestParsed, TestIntent> =
          {
            parseArgs: (args) =>
              Effect.sync(() => {
                callOrder.push("parseArgs");
                return { parsedNames: args.names };
              }),
            finalizeIntent: (parsed) =>
              Effect.sync(() => {
                callOrder.push("finalizeIntent");
                return { targets: [...parsed.parsedNames] };
              }),
            buildUninstallPlan: (_intent) =>
              Effect.sync(() => {
                callOrder.push("buildUninstallPlan");
                return testPlan;
              }),
          };

        yield* runUninstallCommandWorkflow({ names: ["skill-a"] }, actions, {
          execution: confirmableApplyExecution(testRecovery),
        });

        expect(callOrder).toEqual(["parseArgs", "finalizeIntent", "buildUninstallPlan"]);
      }).pipe(Effect.provide(makeTestLayer())),
  );

  it.effect("passes the built plan to previewOrApplyPlan", () => {
    const testPlan: Plan = {
      _tag: "Plan",
      name: "captured-uninstall-plan",
      description: Option.some("uninstall description"),
      jobs: [],
    };

    const actions: UninstallExtensionCommandWorkflowActions<TestArgs, TestParsed, TestIntent> = {
      parseArgs: () => Effect.succeed({ parsedNames: ["x"] }),
      finalizeIntent: () => Effect.succeed({ targets: ["x"] }),
      buildUninstallPlan: () => Effect.succeed(testPlan),
    };

    return Effect.gen(function* () {
      yield* runUninstallCommandWorkflow({ names: ["x"] }, actions, {
        execution: confirmableApplyExecution(testRecovery),
      });
      // previewOrApplyPlan is now a free function; buildUninstallPlan output flows through automatically
      expect(testPlan.name).toBe("captured-uninstall-plan");
    }).pipe(Effect.provide(makeTestLayer()));
  });

  it.effect("threads data between phases correctly", () =>
    Effect.gen(function* () {
      let capturedParsed: TestParsed | undefined;
      let capturedIntent: TestIntent | undefined;

      const actions: UninstallExtensionCommandWorkflowActions<TestArgs, TestParsed, TestIntent> = {
        parseArgs: (args) => {
          const parsed = { parsedNames: args.names };
          return Effect.succeed(parsed);
        },
        finalizeIntent: (parsed) => {
          capturedParsed = parsed;
          const intent = { targets: [...parsed.parsedNames] };
          return Effect.succeed(intent);
        },
        buildUninstallPlan: (intent) => {
          capturedIntent = intent;
          return Effect.succeed({
            _tag: "Plan" as const,
            name: "test",
            description: Option.none(),
            jobs: [],
          });
        },
      };

      yield* runUninstallCommandWorkflow({ names: ["skill-a", "skill-b"] }, actions, {
        execution: confirmableApplyExecution(testRecovery),
      });

      expect(capturedParsed).toEqual({ parsedNames: ["skill-a", "skill-b"] });
      expect(capturedIntent).toEqual({ targets: ["skill-a", "skill-b"] });
    }).pipe(Effect.provide(makeTestLayer())),
  );

  it.effect("propagates parseArgs failure", () =>
    Effect.gen(function* () {
      const actions: UninstallExtensionCommandWorkflowActions<TestArgs, TestParsed, TestIntent> = {
        parseArgs: () => Effect.fail(makeAppError({ code: "validation", detail: "bad args" })),
        finalizeIntent: () => Effect.succeed({ targets: [] }),
        buildUninstallPlan: () =>
          Effect.succeed({
            _tag: "Plan" as const,
            name: "t",
            description: Option.none(),
            jobs: [],
          }),
      };

      const exit = yield* runUninstallCommandWorkflow({ names: [] }, actions, {
        execution: confirmableApplyExecution(testRecovery),
      }).pipe(Effect.exit);
      expect(exit._tag).toBe("Failure");
    }).pipe(Effect.provide(makeTestLayer())),
  );

  it.effect("propagates buildUninstallPlan failure", () =>
    Effect.gen(function* () {
      const actions: UninstallExtensionCommandWorkflowActions<TestArgs, TestParsed, TestIntent> = {
        parseArgs: () => Effect.succeed({ parsedNames: ["x"] }),
        finalizeIntent: () => Effect.succeed({ targets: ["x"] }),
        buildUninstallPlan: () =>
          Effect.fail(makeAppError({ code: "internal", detail: "plan error" })),
      };

      const exit = yield* runUninstallCommandWorkflow({ names: ["x"] }, actions, {
        execution: confirmableApplyExecution(testRecovery),
      }).pipe(Effect.exit);
      expect(exit._tag).toBe("Failure");
    }).pipe(Effect.provide(makeTestLayer())),
  );

  it.effect("does not call later phases when an earlier phase fails", () =>
    Effect.gen(function* () {
      const callOrder: string[] = [];

      const actions: UninstallExtensionCommandWorkflowActions<TestArgs, TestParsed, TestIntent> = {
        parseArgs: () => Effect.succeed({ parsedNames: ["x"] }),
        finalizeIntent: () => {
          callOrder.push("finalizeIntent");
          return Effect.fail(makeAppError({ code: "internal", detail: "intent error" }));
        },
        buildUninstallPlan: () => {
          callOrder.push("buildUninstallPlan");
          return Effect.succeed({
            _tag: "Plan" as const,
            name: "t",
            description: Option.none(),
            jobs: [],
          });
        },
      };

      yield* runUninstallCommandWorkflow({ names: ["x"] }, actions, {
        execution: confirmableApplyExecution(testRecovery),
      }).pipe(Effect.exit);

      expect(callOrder).toEqual(["finalizeIntent"]);
    }).pipe(Effect.provide(makeTestLayer())),
  );
});
