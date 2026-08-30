// @effect-diagnostics anyUnknownInErrorContext:off — generic test harnesses intentionally preserve arbitrary fixture channels
/**
 * Shared test helpers for CLI package tests.
 *
 * @internal Test-only.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { ensureWorkspaceFiles } from "./test-stubs.js";
import { AppError } from "@agentxm/extension-management/unstable/app-error";
import { KnowledgeIndexLive } from "@agentxm/extension-management/unstable/knowledge";
import { CredentialStoreTest, RegistryUrl } from "@agentxm/extension-management/unstable/auth";
import { TestFlagsLayer } from "@agentxm/extension-management/unstable/cli-flags";
import {
  TestMachineRenderer,
  TestRenderer,
  logsByTag,
} from "@agentxm/extension-management/unstable/cli-renderer";
import type { WorkspaceMutationsOptions } from "@agentxm/extension-management/unstable/workspace";
import { decodeAbsolutePathSync } from "@agentxm/extension-management/unstable/utils";
import {
  layer as coreWorkspaceLayer,
  ResolvePlanInteractionTest,
  WorkspaceInitializationInteractionTest,
} from "@agentxm/extension-management/unstable/workspace";
import { ExecutionDirectory } from "./execution-directory.js";

const testHttpClient = HttpClient.make((request) =>
  Effect.succeed(
    HttpClientResponse.fromWeb(
      request,
      new Response("Unexpected test HTTP request", { status: 500 }),
    ),
  ),
);

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
  readonly confirmCalls: Array<{ readonly kind: "resolve-plan" }>;
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

export const planResultUnits = (result: unknown): ReadonlyArray<unknown> => {
  const units = property(result, "units");

  if (!Array.isArray(units)) {
    throw new Error("Expected result.units array");
  }

  return units;
};

const expectPlanCounts = (result: unknown, expected: Readonly<Record<string, number>>): void => {
  const counts = expectRecord(property(result, "counts"));
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actual = property(counts, key);
    if (actual !== expectedValue) {
      throw new Error(
        `Expected plan result counts.${key} to be ${String(expectedValue)}, received ${String(actual)}`,
      );
    }
  }
};

const expectPlanContract = (result: unknown): void => {
  if (property(result, "contract") !== "plan-result-v3") {
    throw new Error("Expected plan-result-v3 contract");
  }
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
  const total = options.totalSteps ?? 1;
  expectPlanContract(result);
  if (property(result, "outcome") !== "applied") {
    throw new Error(
      `Expected plan result outcome to be applied; received ${String(property(result, "outcome"))}: ${JSON.stringify(result["failure"])}`,
    );
  }
  if (property(result, "planName") !== options.planName) {
    throw new Error(`Expected plan result planName to be ${options.planName}`);
  }
  expectPlanCounts(result, {
    total,
    ...(options.appliedCount === undefined ? {} : { committed: options.appliedCount }),
    failed: 0,
    blocked: 0,
    ...(options.warningCount === undefined ? {} : { warnings: options.warningCount }),
  });
  planResultUnits(result);
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
  if (property(payload, "contract") !== "publish-result-v3") {
    throw new Error("Expected publish-result-v3 contract");
  }
  const mode = property(payload, "mode");
  if (mode !== options.mode) {
    throw new Error(`Expected publish result mode to be ${options.mode}`);
  }

  const execution = expectRecord(property(payload, "execution"));
  const results = property(execution, "outcomes");
  if (!Array.isArray(results)) {
    throw new Error("Expected publish result results array");
  }

  if (options.count !== undefined && results.length !== options.count) {
    throw new Error(`Expected publish result to contain ${String(options.count)} results`);
  }

  return { ...payload, results };
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
  const total = options.totalSteps ?? 0;
  expectPlanContract(result);
  if (property(result, "outcome") !== "no-op") {
    throw new Error(`Expected plan result outcome to be no-op`);
  }
  if (property(result, "planName") !== options.planName) {
    throw new Error(`Expected plan result planName to be ${options.planName}`);
  }
  expectPlanCounts(result, { total, committed: 0, failed: 0, blocked: 0 });

  if (options.message !== undefined && property(result, "message") !== options.message) {
    throw new Error(`Expected no-op plan result message to be ${options.message}`);
  }

  const units = planResultUnits(result);
  if (units.length !== total) {
    throw new Error(`Expected no-op plan result to contain ${String(total)} units`);
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
  const ready = options.readyCount ?? options.totalSteps;
  expectPlanContract(result);
  if (property(result, "outcome") !== "previewed") {
    throw new Error(`Expected plan result outcome to be previewed`);
  }
  if (property(result, "planName") !== options.planName) {
    throw new Error(`Expected plan result planName to be ${options.planName}`);
  }
  expectPlanCounts(result, {
    total: options.totalSteps,
    ready,
    committed: 0,
    failed: 0,
  });

  const units = planResultUnits(result);
  if (units.length !== options.totalSteps) {
    throw new Error(
      `Expected previewed plan result to contain ${String(options.totalSteps)} units`,
    );
  }

  return result;
};

export const expectNoPlanEnvelope = (value: unknown): void => {
  const record = expectRecord(value);
  const planFields = ["result", "outcome", "planName", "units"];

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
  readonly httpClient?: HttpClient.HttpClient | undefined;
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

  const nextConfirm = () =>
    Effect.gen(function* () {
      promptState.confirmCalls.push({ kind: "resolve-plan" });
      const response = confirmQueue.shift();
      if (response === undefined) {
        return yield* Effect.die(
          new Error("Test prompt: no canned confirm response for resolve-plan."),
        );
      }
      return response;
    });

  const resolvePlanTest = ResolvePlanInteractionTest({
    confirmApplyChanges: nextConfirm,
  });
  const workspaceInitializationTest = WorkspaceInitializationInteractionTest({
    selectAgents: ({ allAgents, detectedIds }) =>
      Effect.gen(function* () {
        promptState.multiselectCalls.push({
          message: "Select agents to configure",
          options: allAgents.map((agent) => ({
            value: agent.id,
            label: agent.name,
            hint:
              agent.skills === undefined ? "skills: unsupported" : `skills: ${agent.skills.dir}`,
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
    Layer.succeed(HttpClient.HttpClient, opts?.httpClient ?? testHttpClient),
    rendererLayer,
    resolvePlanTest.layer,
    workspaceInitializationTest.layer,
    TestFlagsLayer(opts?.flags),
    Layer.succeed(ExecutionDirectory, { path: decodeAbsolutePathSync(process.cwd()) }),
    Layer.succeed(RegistryUrl, "https://registry.example.com"),
    CredentialStoreTest(),
  );

  return {
    baseLayer,
    logs: logsByTag(rendererState),
    promptState,
    rendererState,
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
  readonly httpClient?: HttpClient.HttpClient | undefined;
  readonly wsOptions?:
    | (Omit<Partial<WorkspaceMutationsOptions>, "projectRoot"> & {
        readonly projectRoot?: string;
      })
    | undefined;
}) => {
  const cliTestContext = makeCliTestContext(opts);
  const projectRoot = decodeAbsolutePathSync(opts?.wsOptions?.projectRoot ?? process.cwd());
  const wsOptions = {
    scope: "project",
    ...opts?.wsOptions,
    projectRoot,
  } satisfies WorkspaceMutationsOptions;

  // Ensure workspace settings exist — loadWorkspace requires an initialized workspace
  if (wsOptions.scope === "project") {
    const workspaceRoot = projectRoot;

    if (opts?.wsOptions?.projectRoot === undefined && isRepositoryPath(workspaceRoot)) {
      throw new Error(
        "Project workspace tests must set wsOptions.projectRoot or chdir into a temp dir before calling makeWorkspaceHandlerTestContext().",
      );
    }

    ensureWorkspaceFiles(path.join(workspaceRoot, ".axm"));
  }

  const wsLayer = Layer.provide(coreWorkspaceLayer(wsOptions), cliTestContext.baseLayer);
  const fullLayer = Layer.mergeAll(cliTestContext.baseLayer, wsLayer, KnowledgeIndexLive);

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
