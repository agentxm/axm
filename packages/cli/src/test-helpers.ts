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
import {
  CliEnvironmentTest,
  type CliEnvironmentService,
} from "@axm.sh/core/unstable/cli-flags";
import {
  makeTestPrompt,
  type TestPromptConfig,
} from "@axm.sh/core/unstable/cli-prompt";
import {
  TestRenderer,
  logsByTag,
} from "@axm.sh/core/unstable/cli-renderer";
import { layer as workspaceLayer, type WorkspaceContextOptions } from "./workspace/index.js";

export interface AppErrorResult {
  readonly error: true;
  readonly what: string;
  readonly howToFix: string;
}

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
    howToFix:
      "howToFix" in result && typeof result.howToFix === "string" ? result.howToFix : "",
  };
};

export const makeCliTestContext = (opts?: {
  readonly prompt?: TestPromptConfig | undefined;
  readonly flags?: (Partial<CliEnvironmentService> & { nonInteractive?: boolean }) | undefined;
}) => {
  const { layer: rendererLayer, state: rendererState } = TestRenderer.make();
  const [promptLayer, promptState] = makeTestPrompt(opts?.prompt);
  const baseLayer = Layer.mergeAll(
    NodeServices.layer,
    rendererLayer,
    promptLayer,
    CliEnvironmentTest(opts?.flags),
  );

  return {
    baseLayer,
    logs: logsByTag(rendererState),
    promptState,
    rendererState,
  };
};

export const makeWorkspaceHandlerTestContext = (opts?: {
  readonly prompt?: TestPromptConfig | undefined;
  readonly flags?: (Partial<CliEnvironmentService> & { nonInteractive?: boolean }) | undefined;
  readonly wsOptions?: Partial<WorkspaceContextOptions> | undefined;
}) => {
  const cliTestContext = makeCliTestContext(opts);
  const wsOptions = {
    scope: "project",
    agents: Option.none(),
    ...opts?.wsOptions,
  } satisfies WorkspaceContextOptions;
  const wsLayer = Layer.provide(workspaceLayer(wsOptions), cliTestContext.baseLayer);
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
