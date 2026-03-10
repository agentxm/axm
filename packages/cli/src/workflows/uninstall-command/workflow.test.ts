/**
 * Tests for runUninstallCommandWorkflow phase ordering.
 *
 * Verifies the canonical sequence: parse -> finalizeIntent ->
 * buildUninstallPlan -> resolvePlan.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeClackLogTestLayer, makeClackPromptTestLayer } from "../../clack-effect/index.js";
import { CliEnvConfig } from "../../config/index.js";
import { CliFlagsTest } from "../../cli-flags/index.js";
import { makeCliError } from "../../cli-error/index.js";
import type { ExecutedPlan, Plan } from "../../workspace/plan.js";
import { type WorkspaceContextService, Workspace } from "../../workspace/service.js";
import {
  type UninstallExtensionCommandWorkflowActions,
  runUninstallCommandWorkflow,
} from "./workflow.js";

// -----------------------------------------------------------------------------
// Test types
// -----------------------------------------------------------------------------

type TestArgs = { readonly names: ReadonlyArray<string> };
type TestParsed = { readonly parsedNames: ReadonlyArray<string> };
type TestIntent = { readonly targets: ReadonlyArray<string> };

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const emptyExecutedPlan: ExecutedPlan = {
  _tag: "ExecutedPlan",
  name: "test",
  description: Option.none(),
  jobs: [],
};

const makeMockWorkspace = (onResolvePlan?: (plan: Plan) => void): WorkspaceContextService =>
  ({
    scope: "project",
    path: "/tmp/test/.axm",
    baseDir: "/tmp/test",
    resolvePlan: (plan: Plan) => {
      onResolvePlan?.(plan);
      return Effect.succeed(emptyExecutedPlan);
    },
  }) as unknown as WorkspaceContextService;

const makeTestLayer = (onResolvePlan?: (plan: Plan) => void) => {
  const [logLayer] = makeClackLogTestLayer();
  const [promptLayer] = makeClackPromptTestLayer({
    methodBehaviors: {
      confirm: { type: "return", value: true },
      multiselect: { type: "return", value: [] },
    },
  });
  return Layer.mergeAll(
    logLayer,
    promptLayer,
    Workspace.layer(makeMockWorkspace(onResolvePlan)),
    CliFlagsTest(),
    CliEnvConfig.testDefaults,
  );
};

// -----------------------------------------------------------------------------
// Task 5.4: Phase ordering tests
// -----------------------------------------------------------------------------

describe("runUninstallCommandWorkflow", () => {
  it.effect(
    "executes phases in canonical order: parse -> finalizeIntent -> buildUninstallPlan -> resolvePlan",
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

        yield* runUninstallCommandWorkflow({ names: ["skill-a"] }, actions);

        expect(callOrder).toEqual(["parseArgs", "finalizeIntent", "buildUninstallPlan"]);
      }).pipe(Effect.provide(makeTestLayer())),
  );

  it.effect("passes the built plan to resolvePlan", () => {
    let capturedPlan: Plan | undefined;
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
      yield* runUninstallCommandWorkflow({ names: ["x"] }, actions);
      expect(capturedPlan).toBe(testPlan);
    }).pipe(
      Effect.provide(
        makeTestLayer((plan) => {
          capturedPlan = plan;
        }),
      ),
    );
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

      yield* runUninstallCommandWorkflow({ names: ["skill-a", "skill-b"] }, actions);

      expect(capturedParsed).toEqual({ parsedNames: ["skill-a", "skill-b"] });
      expect(capturedIntent).toEqual({ targets: ["skill-a", "skill-b"] });
    }).pipe(Effect.provide(makeTestLayer())),
  );

  it.effect("propagates parseArgs failure", () =>
    Effect.gen(function* () {
      const actions: UninstallExtensionCommandWorkflowActions<TestArgs, TestParsed, TestIntent> = {
        parseArgs: () => Effect.fail(makeCliError({ code: "PARSE_FAILED", what: "bad args" })),
        finalizeIntent: () => Effect.succeed({ targets: [] }),
        buildUninstallPlan: () =>
          Effect.succeed({
            _tag: "Plan" as const,
            name: "t",
            description: Option.none(),
            jobs: [],
          }),
      };

      const exit = yield* runUninstallCommandWorkflow({ names: [] }, actions).pipe(Effect.exit);
      expect(exit._tag).toBe("Failure");
    }).pipe(Effect.provide(makeTestLayer())),
  );

  it.effect("propagates buildUninstallPlan failure", () =>
    Effect.gen(function* () {
      const actions: UninstallExtensionCommandWorkflowActions<TestArgs, TestParsed, TestIntent> = {
        parseArgs: () => Effect.succeed({ parsedNames: ["x"] }),
        finalizeIntent: () => Effect.succeed({ targets: ["x"] }),
        buildUninstallPlan: () =>
          Effect.fail(makeCliError({ code: "PLAN_FAILED", what: "plan error" })),
      };

      const exit = yield* runUninstallCommandWorkflow({ names: ["x"] }, actions).pipe(Effect.exit);
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
          return Effect.fail(makeCliError({ code: "INTENT_FAILED", what: "intent error" }));
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

      yield* runUninstallCommandWorkflow({ names: ["x"] }, actions).pipe(Effect.exit);

      expect(callOrder).toEqual(["finalizeIntent"]);
    }).pipe(Effect.provide(makeTestLayer())),
  );
});
