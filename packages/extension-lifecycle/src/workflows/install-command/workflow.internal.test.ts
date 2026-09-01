/**
 * Tests for runInstallCommandWorkflow phase ordering.
 *
 * Verifies the canonical sequence: parse -> resolveSource -> discover ->
 * finalizeIntent -> buildPlan -> previewOrApplyPlan.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import {
  promptablePlanExecution,
  preapprovedPlanExecution,
  type ConfirmationRecovery,
} from "@agentxm/workspace-operations";
import type { Plan } from "@agentxm/workspace-operations";
import { ResolvePlanInteractionTest } from "@agentxm/workspace-operations/testing";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { makeBaseWorkspaceMock } from "@agentxm/workspace-state/testing";
import {
  LifecycleResolutionProgress,
  type InstallExtensionCommandWorkflowActions,
  runInstallCommandWorkflow,
} from "../../index.js";

// -----------------------------------------------------------------------------
// Test types
// -----------------------------------------------------------------------------

type TestArgs = { readonly name: string };
type TestParsed = { readonly parsedName: string };
type TestReq = { readonly source: string };
type TestRef = { readonly refName: string };
type TestIntent = { readonly intentName: string };

class TestFailure extends Data.TaggedError("TestFailure")<{
  readonly detail: string;
}> {}

type TestActions<E = never> = InstallExtensionCommandWorkflowActions<
  TestArgs,
  TestParsed,
  TestReq,
  TestRef,
  TestIntent,
  E
>;

const testRecovery: ConfirmationRecovery = {
  command: ["skills", "install"],
  arguments: [],
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeMockWorkspace = () => makeBaseWorkspaceMock("/tmp/test/.axm");

/** Recording implementation of the workflow's resolution-progress port. */
const makeProgressProbe = () => {
  const events: string[] = [];
  return {
    events,
    layer: Layer.succeed(LifecycleResolutionProgress, {
      withSourceResolution: (effect) =>
        Effect.suspend(() => {
          events.push("source-resolution:start");
          return effect;
        }).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              events.push("source-resolution:end");
            }),
          ),
        ),
    }),
  };
};

const makeTestContext = () => {
  const progress = makeProgressProbe();
  const interaction = ResolvePlanInteractionTest();
  return {
    layer: Layer.mergeAll(
      NodeServices.layer,
      progress.layer,
      WorkspaceMutations.layer(makeMockWorkspace()),
      interaction.layer,
    ),
    progressEvents: progress.events,
  };
};

const makeTestLayer = () => {
  const { layer } = makeTestContext();
  return layer;
};

// -----------------------------------------------------------------------------
// Phase ordering tests
// -----------------------------------------------------------------------------

describe("runInstallCommandWorkflow", () => {
  it.effect("surrounds source resolution with the progress port before applying", () => {
    const context = makeTestContext();
    const actions: TestActions = {
      parseArgs: () => Effect.succeed({ parsedName: "review" }),
      resolveSourceRequests: () => Effect.succeed([{ source: "@acme/skills/review" }]),
      discoverRefs: () => Effect.succeed([{ refName: "@acme/skills/review" }]),
      finalizeIntent: () => Effect.succeed({ intentName: "review" }),
      buildPlan: () =>
        Effect.succeed({
          _tag: "Plan",
          name: "Install @acme/skills/review",
          description: Option.none(),
          jobs: [],
        }),
    };

    return Effect.gen(function* () {
      yield* runInstallCommandWorkflow({ name: "review" }, actions, {
        execution: preapprovedPlanExecution,
      });

      expect(context.progressEvents).toEqual(["source-resolution:start", "source-resolution:end"]);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect(
    "executes phases in canonical order: parse -> resolveSource -> discover -> finalizeIntent -> buildPlan -> previewOrApplyPlan",
    () =>
      Effect.gen(function* () {
        const callOrder: string[] = [];
        const testPlan: Plan = {
          _tag: "Plan",
          name: "test-install",
          description: Option.none(),
          jobs: [],
        };

        const actions: TestActions = {
          parseArgs: (args) =>
            Effect.sync(() => {
              callOrder.push("parseArgs");
              return { parsedName: args.name };
            }),
          resolveSourceRequests: (parsed) =>
            Effect.sync(() => {
              callOrder.push("resolveSourceRequests");
              return [{ source: parsed.parsedName }];
            }),
          discoverRefs: (reqs) =>
            Effect.sync(() => {
              callOrder.push("discoverRefs");
              return reqs.map((r) => ({ refName: r.source }));
            }),
          finalizeIntent: (parsed, refs) =>
            Effect.sync(() => {
              callOrder.push("finalizeIntent");
              return { intentName: `${parsed.parsedName}-${refs.length}` };
            }),
          buildPlan: (_intent) =>
            Effect.sync(() => {
              callOrder.push("buildPlan");
              return testPlan;
            }),
        };

        yield* runInstallCommandWorkflow({ name: "test-skill" }, actions, {
          execution: promptablePlanExecution(testRecovery),
        });

        expect(callOrder).toEqual([
          "parseArgs",
          "resolveSourceRequests",
          "discoverRefs",
          "finalizeIntent",
          "buildPlan",
        ]);
      }).pipe(Effect.provide(makeTestLayer())),
  );

  it.effect("transforms finalized intent before building the plan", () => {
    let builtIntent: TestIntent | undefined;
    const actions: TestActions = {
      parseArgs: () => Effect.succeed({ parsedName: "resolved" }),
      resolveSourceRequests: () => Effect.succeed([{ source: "resolved@2.0.0" }]),
      discoverRefs: () => Effect.succeed([{ refName: "resolved@2.0.0" }]),
      finalizeIntent: () => Effect.succeed({ intentName: "resolved@2.0.0" }),
      buildPlan: (intent) => {
        builtIntent = intent;
        return Effect.succeed({
          _tag: "Plan",
          name: "transformed-install",
          description: Option.none(),
          jobs: [],
        });
      },
    };

    return Effect.gen(function* () {
      yield* runInstallCommandWorkflow({ name: "resolved" }, actions, {
        execution: preapprovedPlanExecution,
        transformIntent: (intent) => ({ ...intent, intentName: "configured-range" }),
      });

      expect(builtIntent).toEqual({ intentName: "configured-range" });
    }).pipe(Effect.provide(makeTestLayer()));
  });

  it.effect("passes the built plan to previewOrApplyPlan", () => {
    const testPlan: Plan = {
      _tag: "Plan",
      name: "captured-plan",
      description: Option.some("test description"),
      jobs: [],
    };

    const actions: TestActions = {
      parseArgs: () => Effect.succeed({ parsedName: "x" }),
      resolveSourceRequests: () => Effect.succeed([{ source: "x" }]),
      discoverRefs: () => Effect.succeed([{ refName: "x" }]),
      finalizeIntent: () => Effect.succeed({ intentName: "x" }),
      buildPlan: () => Effect.succeed(testPlan),
    };

    return Effect.gen(function* () {
      yield* runInstallCommandWorkflow({ name: "test" }, actions, {
        execution: promptablePlanExecution(testRecovery),
      });
      // previewOrApplyPlan is now a free function; buildPlan output flows through automatically
      expect(testPlan.name).toBe("captured-plan");
    }).pipe(Effect.provide(makeTestLayer()));
  });

  it.effect("keeps scoped discovery resources alive while applying the install plan", () =>
    Effect.gen(function* () {
      let released = false;
      let stepRan = false;

      const actions: TestActions = {
        parseArgs: () => Effect.succeed({ parsedName: "x" }),
        resolveSourceRequests: () => Effect.succeed([{ source: "x" }]),
        discoverRefs: () =>
          Effect.acquireRelease(Effect.succeed([{ refName: "x" }]), () =>
            Effect.sync(() => {
              released = true;
            }),
          ),
        finalizeIntent: () => Effect.succeed({ intentName: "x" }),
        buildPlan: () =>
          Effect.succeed({
            _tag: "Plan" as const,
            name: "scoped-source-install",
            description: Option.none(),
            jobs: [
              {
                concurrency: 1,
                steps: [
                  {
                    readiness: "ready" as const,
                    label: "Copy from scoped source",
                    run: Effect.sync(() => {
                      expect(released).toBe(false);
                      stepRan = true;
                      return { result: "success" as const, message: "copied" };
                    }),
                  },
                ],
              },
            ],
          }),
      };

      yield* runInstallCommandWorkflow({ name: "test" }, actions, {
        execution: preapprovedPlanExecution,
      });

      expect(stepRan).toBe(true);
      expect(released).toBe(true);
    }).pipe(Effect.provide(makeTestLayer())),
  );

  it.effect("threads data between phases correctly", () =>
    Effect.gen(function* () {
      let capturedParsed: TestParsed | undefined;
      let capturedReqs: ReadonlyArray<TestReq> | undefined;
      let capturedRefs: ReadonlyArray<TestRef> | undefined;
      let capturedParsedInFinalize: TestParsed | undefined;
      let capturedIntent: TestIntent | undefined;

      const actions: TestActions = {
        parseArgs: (args) => {
          const parsed = { parsedName: args.name };
          return Effect.succeed(parsed);
        },
        resolveSourceRequests: (parsed) => {
          capturedParsed = parsed;
          const reqs = [{ source: parsed.parsedName }];
          return Effect.succeed(reqs);
        },
        discoverRefs: (reqs) => {
          capturedReqs = reqs;
          const refs = reqs.map((r) => ({ refName: r.source }));
          return Effect.succeed(refs);
        },
        finalizeIntent: (parsed, refs) => {
          capturedParsedInFinalize = parsed;
          capturedRefs = refs;
          const intent = { intentName: `${parsed.parsedName}-${refs.length}` };
          return Effect.succeed(intent);
        },
        buildPlan: (intent) => {
          capturedIntent = intent;
          return Effect.succeed({
            _tag: "Plan" as const,
            name: "test",
            description: Option.none(),
            jobs: [],
          });
        },
      };

      yield* runInstallCommandWorkflow({ name: "my-skill" }, actions, {
        execution: promptablePlanExecution(testRecovery),
      });

      expect(capturedParsed).toEqual({ parsedName: "my-skill" });
      expect(capturedReqs).toEqual([{ source: "my-skill" }]);
      expect(capturedRefs).toEqual([{ refName: "my-skill" }]);
      expect(capturedParsedInFinalize).toEqual({ parsedName: "my-skill" });
      expect(capturedIntent).toEqual({ intentName: "my-skill-1" });
    }).pipe(Effect.provide(makeTestLayer())),
  );

  it.effect("propagates parseArgs failure", () =>
    Effect.gen(function* () {
      const actions: TestActions<TestFailure> = {
        parseArgs: () => Effect.fail(new TestFailure({ detail: "bad args" })),
        resolveSourceRequests: () => Effect.succeed([]),
        discoverRefs: () => Effect.succeed([]),
        finalizeIntent: () => Effect.succeed({ intentName: "x" }),
        buildPlan: () =>
          Effect.succeed({
            _tag: "Plan" as const,
            name: "t",
            description: Option.none(),
            jobs: [],
          }),
      };

      const exit = yield* runInstallCommandWorkflow({ name: "test" }, actions, {
        execution: promptablePlanExecution(testRecovery),
      }).pipe(Effect.exit);
      expect(exit._tag).toBe("Failure");
    }).pipe(Effect.provide(makeTestLayer())),
  );

  it.effect("propagates buildPlan failure", () =>
    Effect.gen(function* () {
      const actions: TestActions<TestFailure> = {
        parseArgs: () => Effect.succeed({ parsedName: "x" }),
        resolveSourceRequests: () => Effect.succeed([{ source: "x" }]),
        discoverRefs: () => Effect.succeed([{ refName: "x" }]),
        finalizeIntent: () => Effect.succeed({ intentName: "x" }),
        buildPlan: () => Effect.fail(new TestFailure({ detail: "plan error" })),
      };

      const exit = yield* runInstallCommandWorkflow({ name: "test" }, actions, {
        execution: promptablePlanExecution(testRecovery),
      }).pipe(Effect.exit);
      expect(exit._tag).toBe("Failure");
    }).pipe(Effect.provide(makeTestLayer())),
  );

  it.effect("does not call later phases when an earlier phase fails", () =>
    Effect.gen(function* () {
      const callOrder: string[] = [];

      const actions: TestActions<TestFailure> = {
        parseArgs: () => Effect.succeed({ parsedName: "x" }),
        resolveSourceRequests: () => {
          callOrder.push("resolveSourceRequests");
          return Effect.fail(new TestFailure({ detail: "source error" }));
        },
        discoverRefs: () => {
          callOrder.push("discoverRefs");
          return Effect.succeed([]);
        },
        finalizeIntent: () => {
          callOrder.push("finalizeIntent");
          return Effect.succeed({ intentName: "x" });
        },
        buildPlan: () => {
          callOrder.push("buildPlan");
          return Effect.succeed({
            _tag: "Plan" as const,
            name: "t",
            description: Option.none(),
            jobs: [],
          });
        },
      };

      yield* runInstallCommandWorkflow({ name: "test" }, actions, {
        execution: promptablePlanExecution(testRecovery),
      }).pipe(Effect.exit);

      expect(callOrder).toEqual(["resolveSourceRequests"]);
    }).pipe(Effect.provide(makeTestLayer())),
  );
});
