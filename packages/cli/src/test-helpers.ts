/**
 * Shared test helpers for CLI package tests.
 *
 * @internal Test-only.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { ensureWorkspaceFiles } from "./test-stubs.js";
import { AppError } from "@agentxm/client-core/unstable/app-error";
import {
  AuthGuardInteractionTest,
  CredentialStoreTest,
  RegistryUrl,
} from "@agentxm/client-core/unstable/auth";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import {
  TestMachineRenderer,
  TestRenderer,
  logsByTag,
} from "@agentxm/client-core/unstable/cli-renderer";
import type { WorkspaceMutationsOptions } from "@agentxm/client-core/unstable/workspace";
import {
  layer as coreWorkspaceLayer,
  ResolvePlanInteractionTest,
  WorkspaceInitializationInteractionTest,
} from "@agentxm/client-core/unstable/workspace";

const fs = (() => {
  const module = process.getBuiltinModule("node:fs");
  if (!module) {
    throw new Error("node:fs builtin is unavailable");
  }
  return module;
})();

const path = (() => {
  const module = process.getBuiltinModule("node:path");
  if (!module) {
    throw new Error("node:path builtin is unavailable");
  }
  return module;
})();

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
  readonly message: string;
  readonly guidance: string;
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

export const planResultSteps = (result: unknown): ReadonlyArray<unknown> => {
  const steps = property(result, "steps");

  if (!Array.isArray(steps)) {
    throw new Error("Expected result.steps array");
  }

  return steps;
};

export const expectAppliedPlanResult = (
  value: unknown,
  options: {
    readonly planName: string;
    readonly totalSteps?: number;
    readonly appliedCount?: number;
    readonly warningCount?: number;
  },
): Readonly<Record<string, unknown>> => {
  const payload = expectRecord(value);
  const result = expectRecord(property(payload, "result"));
  const totalSteps = options.totalSteps ?? 1;
  const appliedCount = options.appliedCount ?? totalSteps;
  const expected = {
    outcome: "applied",
    planName: options.planName,
    totalSteps,
    readyCount: 0,
    warningCount: options.warningCount ?? 0,
    errorCount: 0,
    appliedCount,
    failedCount: 0,
    blockedCount: 0,
  };

  for (const [key, expectedValue] of Object.entries(expected)) {
    const actual = property(result, key);
    if (actual !== expectedValue) {
      throw new Error(
        `Expected plan result ${key} to be ${String(expectedValue)}, received ${String(actual)}`,
      );
    }
  }

  planResultSteps(result);
  return result;
};

export const expectPublishResult = (
  value: unknown,
  options: {
    readonly mode: "preview" | "apply";
    readonly count?: number;
  },
): Readonly<Record<string, unknown>> => {
  const payload = expectRecord(value);
  const mode = property(payload, "mode");
  if (mode !== options.mode) {
    throw new Error(`Expected publish result mode to be ${options.mode}`);
  }

  const results = property(payload, "results");
  if (!Array.isArray(results)) {
    throw new Error("Expected publish result results array");
  }

  if (options.count !== undefined && results.length !== options.count) {
    throw new Error(`Expected publish result to contain ${String(options.count)} results`);
  }

  return payload;
};

export const expectNoOpPlanResult = (
  value: unknown,
  options: {
    readonly planName: string;
    readonly totalSteps?: number;
    readonly message?: string;
  },
): Readonly<Record<string, unknown>> => {
  const payload = expectRecord(value);
  const result = expectRecord(property(payload, "result"));
  const totalSteps = options.totalSteps ?? 0;
  const expected = {
    outcome: "no-op",
    planName: options.planName,
    totalSteps,
    readyCount: 0,
    warningCount: 0,
    errorCount: 0,
    appliedCount: 0,
    failedCount: 0,
    blockedCount: 0,
  };

  for (const [key, expectedValue] of Object.entries(expected)) {
    const actual = property(result, key);
    if (actual !== expectedValue) {
      throw new Error(`Expected no-op plan result ${key} to be ${String(expectedValue)}`);
    }
  }

  if (options.message !== undefined && property(result, "message") !== options.message) {
    throw new Error(`Expected no-op plan result message to be ${options.message}`);
  }

  const steps = planResultSteps(result);
  if (steps.length !== totalSteps) {
    throw new Error(`Expected no-op plan result to contain ${String(totalSteps)} steps`);
  }

  return result;
};

export const expectPreviewedPlanResult = (
  value: unknown,
  options: {
    readonly planName: string;
    readonly totalSteps: number;
    readonly readyCount?: number;
  },
): Readonly<Record<string, unknown>> => {
  const payload = expectRecord(value);
  const result = expectRecord(property(payload, "result"));
  const readyCount = options.readyCount ?? options.totalSteps;
  const expected = {
    outcome: "previewed",
    planName: options.planName,
    totalSteps: options.totalSteps,
    readyCount,
    warningCount: 0,
    errorCount: 0,
    appliedCount: 0,
    failedCount: 0,
    blockedCount: 0,
  };

  for (const [key, expectedValue] of Object.entries(expected)) {
    const actual = property(result, key);
    if (actual !== expectedValue) {
      throw new Error(`Expected previewed plan result ${key} to be ${String(expectedValue)}`);
    }
  }

  const steps = planResultSteps(result);
  if (steps.length !== options.totalSteps) {
    throw new Error(
      `Expected previewed plan result to contain ${String(options.totalSteps)} steps`,
    );
  }

  return result;
};

export const expectNoPlanEnvelope = (value: unknown): void => {
  const record = expectRecord(value);
  const planFields = ["result", "outcome", "planName", "steps"];

  for (const field of planFields) {
    if (field in record) {
      throw new Error(`Expected read/query output without plan field ${field}`);
    }
  }
};

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
    !("message" in result) ||
    typeof result.message !== "string"
  ) {
    throw new Error("Expected caught AppError result");
  }

  return {
    error: true,
    message: result.message,
    guidance: "guidance" in result && typeof result.guidance === "string" ? result.guidance : "",
  };
};

export const makeCliTestContext = (opts?: {
  readonly prompt?: TestPromptConfig | undefined;
  readonly flags?:
    | {
        verbose?: boolean;
        debug?: boolean;
        quiet?: boolean;
        nonInteractive?: boolean;
        json?: boolean;
      }
    | undefined;
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
    Layer.succeed(RegistryUrl, "https://registry.example.com"),
    CredentialStoreTest(),
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

const isRepositoryPath = (startDir: string): boolean => {
  let current = path.resolve(startDir);

  while (true) {
    if (
      fs.existsSync(path.join(current, ".git")) ||
      fs.existsSync(path.join(current, "pnpm-workspace.yaml"))
    ) {
      return true;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return false;
    }

    current = parent;
  }
};

export const makeWorkspaceHandlerTestContext = (opts?: {
  readonly prompt?: TestPromptConfig | undefined;
  readonly flags?:
    | {
        verbose?: boolean;
        debug?: boolean;
        quiet?: boolean;
        nonInteractive?: boolean;
        json?: boolean;
      }
    | undefined;
  readonly machine?: boolean | undefined;
  readonly wsOptions?: Partial<WorkspaceMutationsOptions> | undefined;
}) => {
  const cliTestContext = makeCliTestContext(opts);
  const wsOptions = {
    scope: "project",
    ...opts?.wsOptions,
  } satisfies WorkspaceMutationsOptions;
  const projectRoot =
    wsOptions.scope === "project" ? (wsOptions.projectRoot ?? process.cwd()) : undefined;

  // Ensure workspace settings exist — loadWorkspace requires an initialized workspace
  if (wsOptions.scope === "project") {
    const workspaceRoot = projectRoot ?? process.cwd();

    if (wsOptions.projectRoot === undefined && isRepositoryPath(workspaceRoot)) {
      throw new Error(
        "Project workspace tests must set wsOptions.projectRoot or chdir into a temp dir before calling makeWorkspaceHandlerTestContext().",
      );
    }

    ensureWorkspaceFiles(path.join(workspaceRoot, ".axm"));
  }

  const workspaceOptions =
    wsOptions.scope === "project"
      ? {
          ...wsOptions,
          projectRoot: projectRoot ?? process.cwd(),
        }
      : wsOptions;
  const wsLayer = Layer.provide(coreWorkspaceLayer(workspaceOptions), cliTestContext.baseLayer);
  const fullLayer = Layer.mergeAll(cliTestContext.baseLayer, wsLayer);

  return {
    ...cliTestContext,
    ...(wsOptions.scope === "project" ? { projectRoot } : {}),
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
