/**
 * Shared test helpers for CLI package tests.
 *
 * @internal Test-only.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { AppError } from "@axm.sh/core/unstable/app-error";
import { AuthGuardInteractionTest } from "@axm.sh/core/unstable/auth";
import { TestFlagsLayer } from "@axm.sh/core/unstable/cli-flags";
import { TestMachineRenderer, TestRenderer, logsByTag } from "@axm.sh/core/unstable/cli-renderer";
import type { WorkspaceContextOptions } from "@axm.sh/core/unstable/workspace";
import {
  layer as coreWorkspaceLayer,
  ResolvePlanInteractionTest,
  WorkspaceInitializationInteractionTest,
} from "@axm.sh/core/unstable/workspace";

export interface TestPromptConfig {
  readonly confirmResponses?: ReadonlyArray<boolean>;
  readonly multiselectResponses?: ReadonlyArray<ReadonlyArray<string>>;
}

export interface TestPromptState {
  readonly confirmCalls: Array<{ readonly kind: "auth-guard" | "resolve-plan" }>;
  readonly multiselectCalls: Array<{
    readonly message: string;
    readonly options: ReadonlyArray<{
      readonly value: string;
      readonly label: string;
      readonly hint?: string;
    }>;
    readonly initialValues: ReadonlyArray<string>;
    readonly required: boolean;
  }>;
}

export interface AppErrorResult {
  readonly error: true;
  readonly what: string;
  readonly howToFix: string;
}

export const expectDefined = <T>(
  value: T | null | undefined,
  message = "Expected value to be defined",
): T => {
  if (value == null) {
    throw new Error(message);
  }

  return value;
};

export const at = <T>(values: ReadonlyArray<T>, index: number, message?: string): T =>
  expectDefined(values[index], message ?? `Expected value at index ${index}`);

export const recordEntry = <T>(
  value: Readonly<Record<string, T>> | Partial<Record<string, T>> | undefined,
  key: string,
  message?: string,
): T => expectDefined(value?.[key], message ?? `Expected record entry for ${key}`);

export const firstCall = <T>(
  calls: ReadonlyArray<ReadonlyArray<T>>,
  message = "Expected mock to be called",
): ReadonlyArray<T> => at(calls, 0, message);

export const firstCallArg = <T>(
  calls: ReadonlyArray<ReadonlyArray<T>>,
  index = 0,
  message?: string,
): T =>
  at(
    firstCall(calls, message),
    index,
    message ?? `Expected argument ${index} from first mock call`,
  );

export const expectSome = <T>(value: Option.Option<T>, message = "Expected Option.some"): T =>
  Option.match(value, {
    onNone: () => {
      throw new Error(message);
    },
    onSome: (item) => item,
  });

export const expectRecord = (
  value: unknown,
  message = "Expected object record",
): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(message);
  }

  return Object.fromEntries(Object.entries(value));
};

export const property = (value: unknown, key: string, message?: string): unknown =>
  expectDefined(
    expectRecord(value, message ?? `Expected object containing ${key}`)[key],
    message ?? `Expected property ${key}`,
  );

export const stringProperty = (value: unknown, key: string, message?: string): string => {
  const field = property(value, key, message);

  if (typeof field !== "string") {
    throw new Error(message ?? `Expected string property ${key}`);
  }

  return field;
};

export const stringArrayProperty = (
  value: unknown,
  key: string,
  message?: string,
): ReadonlyArray<string> => {
  const field = property(value, key, message);

  if (!Array.isArray(field) || field.some((entry) => typeof entry !== "string")) {
    throw new Error(message ?? `Expected string[] property ${key}`);
  }

  return field;
};

export const getAppError = (error: unknown): AppError => {
  if (!(error instanceof AppError)) {
    throw new Error("Expected AppError");
  }
  return error;
};

export const getErrorResult = (result: unknown): AppErrorResult => {
  if (
    typeof result !== "object" ||
    result === null ||
    !("error" in result) ||
    result.error !== true ||
    !("what" in result) ||
    typeof result.what !== "string"
  ) {
    throw new Error("Expected caught AppError result");
  }

  return {
    error: true,
    what: result.what,
    howToFix: "howToFix" in result && typeof result.howToFix === "string" ? result.howToFix : "",
  };
};

export const makeCliTestContext = (opts?: {
  readonly prompt?: TestPromptConfig | undefined;
  readonly flags?: { verbose?: boolean; debug?: boolean; nonInteractive?: boolean } | undefined;
  readonly machine?: boolean | undefined;
}) => {
  const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
  const rendererLayer = renderer.layer;
  const rendererState = renderer.state;
  const promptState: TestPromptState = {
    confirmCalls: [],
    multiselectCalls: [],
  };
  const confirmQueue = Array.from(opts?.prompt?.confirmResponses ?? []);
  const multiselectQueue = Array.from(opts?.prompt?.multiselectResponses ?? []);

  const nextConfirm = (kind: "auth-guard" | "resolve-plan") =>
    Effect.gen(function* () {
      promptState.confirmCalls.push({ kind });
      const response = confirmQueue.shift();
      if (response === undefined) {
        return yield* Effect.die(new Error(`Test prompt: no canned confirm response for ${kind}.`));
      }
      return response;
    });

  const authGuardTest = AuthGuardInteractionTest({
    confirmLogin: () => nextConfirm("auth-guard"),
  });
  const resolvePlanTest = ResolvePlanInteractionTest({
    confirmApplyChanges: () => nextConfirm("resolve-plan"),
  });
  const workspaceInitializationTest = WorkspaceInitializationInteractionTest({
    selectAgents: ({ allAgents, detectedIds }) =>
      Effect.gen(function* () {
        promptState.multiselectCalls.push({
          message: "Select agents to configure",
          options: allAgents.map((agent) => ({
            value: agent.id,
            label: agent.name,
            hint: `skills: ${agent.skills.dir}`,
          })),
          initialValues: detectedIds,
          required: false,
        });
        const response = multiselectQueue.shift();
        if (response === undefined) {
          return yield* Effect.die(
            new Error("Test prompt: no canned multiselect response for workspace initialization."),
          );
        }
        return response;
      }),
  });
  const baseLayer = Layer.mergeAll(
    NodeServices.layer,
    rendererLayer,
    authGuardTest.layer,
    resolvePlanTest.layer,
    workspaceInitializationTest.layer,
    TestFlagsLayer(opts?.flags),
  );

  return {
    baseLayer,
    logs: logsByTag(rendererState),
    promptState,
    rendererState,
    authGuardState: authGuardTest.state,
    resolvePlanState: resolvePlanTest.state,
    workspaceInitializationState: workspaceInitializationTest.state,
  };
};

export const makeWorkspaceHandlerTestContext = (opts?: {
  readonly prompt?: TestPromptConfig | undefined;
  readonly flags?: { verbose?: boolean; debug?: boolean; nonInteractive?: boolean } | undefined;
  readonly machine?: boolean | undefined;
  readonly wsOptions?: Partial<WorkspaceContextOptions> | undefined;
}) => {
  const cliTestContext = makeCliTestContext(opts);
  const wsOptions = {
    scope: "project",
    ...opts?.wsOptions,
  } satisfies WorkspaceContextOptions;
  const wsLayer = Layer.provide(coreWorkspaceLayer(wsOptions), cliTestContext.baseLayer);
  const fullLayer = Layer.mergeAll(cliTestContext.baseLayer, wsLayer);

  return {
    ...cliTestContext,
    wsLayer,
    fullLayer,
    provide: makeEffectProvide(fullLayer),
  };
};

export const makeEffectProvide = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper hides layer variance
  layer: Layer.Layer<any, any, any>,
) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper hides generic layer plumbing
  return <A, E>(effect: Effect.Effect<A, E, any>) => effect.pipe(Effect.provide(layer));
};
