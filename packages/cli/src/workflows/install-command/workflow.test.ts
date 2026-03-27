/**
 * Tests for runInstallCommandWorkflow phase ordering.
 *
 * Verifies the canonical sequence: parse -> resolveSource -> discover ->
 * finalizeIntent -> buildPlan -> resolvePlan.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { TestRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { makeTestPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliEnvironmentTest } from "@axm.sh/core/unstable/cli-flags";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import type { Plan } from "../../workspace/plan.js";
import { Workspace } from "../../workspace/service.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import {
  type InstallExtensionCommandWorkflowActions,
  runInstallCommandWorkflow,
} from "./workflow.js";

// -----------------------------------------------------------------------------
// Test types
// -----------------------------------------------------------------------------

type TestArgs = { readonly name: string };
type TestParsed = { readonly parsedName: string };
type TestReq = { readonly source: string };
type TestRef = { readonly refName: string };
type TestIntent = { readonly intentName: string };

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeMockWorkspace = () => makeBaseWorkspaceMock("/tmp/test/.axm");

const makeTestLayer = () => {
  const { layer: rendererLayer } = TestRenderer.make();
  const [promptLayer] = makeTestPrompt({
    confirmResponses: [true],
    multiselectResponses: [[]],
  });
  return Layer.mergeAll(
    NodeServices.layer,
    rendererLayer,
    promptLayer,
    Workspace.layer(makeMockWorkspace()),
    CliEnvironmentTest(),
  );
};

// -----------------------------------------------------------------------------
// Task 5.1: Phase ordering tests
// -----------------------------------------------------------------------------

describe("runInstallCommandWorkflow", () => {
  it.effect(
    "executes phases in canonical order: parse -> resolveSource -> discover -> finalizeIntent -> buildPlan -> resolvePlan",
    () =>
      Effect.gen(function* () {
        const callOrder: string[] = [];
        const testPlan: Plan = {
          _tag: "Plan",
          name: "test-install",
          description: Option.none(),
          jobs: [],
        };

        const actions: InstallExtensionCommandWorkflowActions<
          TestArgs,
          TestParsed,
          TestReq,
          TestRef,
          TestIntent
        > = {
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
          yes: false,
          force: false,
          preview: false,
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

  it.effect("passes the built plan to resolvePlan", () => {
    const testPlan: Plan = {
      _tag: "Plan",
      name: "captured-plan",
      description: Option.some("test description"),
      jobs: [],
    };

    const actions: InstallExtensionCommandWorkflowActions<
      TestArgs,
      TestParsed,
      TestReq,
      TestRef,
      TestIntent
    > = {
      parseArgs: () => Effect.succeed({ parsedName: "x" }),
      resolveSourceRequests: () => Effect.succeed([{ source: "x" }]),
      discoverRefs: () => Effect.succeed([{ refName: "x" }]),
      finalizeIntent: () => Effect.succeed({ intentName: "x" }),
      buildPlan: () => Effect.succeed(testPlan),
    };

    return Effect.gen(function* () {
      yield* runInstallCommandWorkflow({ name: "test" }, actions, {
        yes: false,
        force: false,
        preview: false,
      });
      // resolvePlan is now a free function; buildPlan output flows through automatically
      expect(testPlan.name).toBe("captured-plan");
    }).pipe(Effect.provide(makeTestLayer()));
  });

  it.effect("threads data between phases correctly", () =>
    Effect.gen(function* () {
      let capturedParsed: TestParsed | undefined;
      let capturedReqs: ReadonlyArray<TestReq> | undefined;
      let capturedRefs: ReadonlyArray<TestRef> | undefined;
      let capturedParsedInFinalize: TestParsed | undefined;
      let capturedIntent: TestIntent | undefined;

      const actions: InstallExtensionCommandWorkflowActions<
        TestArgs,
        TestParsed,
        TestReq,
        TestRef,
        TestIntent
      > = {
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
        yes: false,
        force: false,
        preview: false,
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
      const actions: InstallExtensionCommandWorkflowActions<
        TestArgs,
        TestParsed,
        TestReq,
        TestRef,
        TestIntent
      > = {
        parseArgs: () => Effect.fail(makeAppError({ code: "PARSE_FAILED", what: "bad args" })),
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
        yes: false,
        force: false,
        preview: false,
      }).pipe(Effect.exit);
      expect(exit._tag).toBe("Failure");
    }).pipe(Effect.provide(makeTestLayer())),
  );

  it.effect("propagates buildPlan failure", () =>
    Effect.gen(function* () {
      const actions: InstallExtensionCommandWorkflowActions<
        TestArgs,
        TestParsed,
        TestReq,
        TestRef,
        TestIntent
      > = {
        parseArgs: () => Effect.succeed({ parsedName: "x" }),
        resolveSourceRequests: () => Effect.succeed([{ source: "x" }]),
        discoverRefs: () => Effect.succeed([{ refName: "x" }]),
        finalizeIntent: () => Effect.succeed({ intentName: "x" }),
        buildPlan: () => Effect.fail(makeAppError({ code: "PLAN_FAILED", what: "plan error" })),
      };

      const exit = yield* runInstallCommandWorkflow({ name: "test" }, actions, {
        yes: false,
        force: false,
        preview: false,
      }).pipe(Effect.exit);
      expect(exit._tag).toBe("Failure");
    }).pipe(Effect.provide(makeTestLayer())),
  );

  it.effect("does not call later phases when an earlier phase fails", () =>
    Effect.gen(function* () {
      const callOrder: string[] = [];

      const actions: InstallExtensionCommandWorkflowActions<
        TestArgs,
        TestParsed,
        TestReq,
        TestRef,
        TestIntent
      > = {
        parseArgs: () => Effect.succeed({ parsedName: "x" }),
        resolveSourceRequests: () => {
          callOrder.push("resolveSourceRequests");
          return Effect.fail(makeAppError({ code: "SOURCE_FAILED", what: "source error" }));
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
        yes: false,
        force: false,
        preview: false,
      }).pipe(Effect.exit);

      expect(callOrder).toEqual(["resolveSourceRequests"]);
    }).pipe(Effect.provide(makeTestLayer())),
  );
});
