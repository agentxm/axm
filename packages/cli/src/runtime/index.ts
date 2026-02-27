/**
 * CLI Runtime Module
 *
 * Provides centralized Effect runtime configuration for CLI commands.
 * Uses ManagedRuntime for proper lifecycle management and resource cleanup.
 */

import type { HttpClient } from "@effect/platform";
import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import type * as Scope from "effect/Scope";

import * as Option from "effect/Option";

import type { CliError } from "../cli-error/index.js";
import { type CliFlags, type CliFlagsInput, layer as cliFlagsLayer } from "../cli-flags/index.js";
import {
  ClackLive,
  type ClackLog,
  type ClackProgress,
  type ClackPrompt,
  type ClackSpinner,
  type ClackStream,
  type ClackTaskLog,
  type Confirm,
  type Multiselect,
  type PasswordInput,
  type Select,
  type TextInput,
} from "../clack-effect/index.js";
import type { PromptCancelled } from "../prompt-cancelled.js";
import { type SourceHostProviders, SourceHostProvidersLive } from "../sources/index.js";
import {
  Workspace,
  layer as workspaceLayer,
  type WorkspaceContextOptions,
} from "../workspace/index.js";
import { classifyError } from "./error-handling.js";

/**
 * Standard dependencies available to all CLI commands:
 * - FileSystem, Path (from @effect/platform-node)
 * - HttpClient (for network requests)
 * - Clack services (prompts, logging, spinner, stream, progress, task log)
 * - Legacy prompt adapter tags (Confirm/Select/Multiselect/TextInput/PasswordInput)
 */
export type AppLayer =
  | NodeContext.NodeContext
  | HttpClient.HttpClient
  | CliFlags
  | ClackLog
  | ClackSpinner
  | ClackPrompt
  | ClackProgress
  | ClackTaskLog
  | ClackStream
  | TextInput
  | PasswordInput
  | Confirm
  | Select
  | Multiselect;

/**
 * Default CliFlags layer using auto-detection for nonInteractive.
 * Overridden per-invocation in run() when flags are provided.
 */
const DefaultCliFlagsLayer = cliFlagsLayer({
  nonInteractive: Option.none(),
  yes: false,
  force: false,
  preview: false,
});

/**
 * Layer providing all standard CLI dependencies.
 * ClackLive depends on CliFlags (for prompt non-interactive guard).
 */
export const AppLayer: Layer.Layer<AppLayer> = Layer.mergeAll(
  NodeContext.layer,
  FetchHttpClient.layer,
  Layer.provide(ClackLive, DefaultCliFlagsLayer),
  DefaultCliFlagsLayer,
);

/**
 * ManagedRuntime for CLI commands.
 * Handles lifecycle and resource cleanup automatically.
 */
export const Runtime = ManagedRuntime.make(AppLayer);

export interface RunOptions {
  readonly flags?: CliFlagsInput;
  readonly workspace?: WorkspaceContextOptions;
}

/**
 * Run an Effect program with CLI dependencies and error handling.
 * Exit codes: 0 (prompt cancelled), 1 (expected error).
 *
 * The CliFlags layer is always provided. When flags are not passed
 * explicitly, they are derived from workspace options (transitional)
 * or default to non-interactive with no overrides.
 *
 * When workspace options are provided, the WorkspaceContext layer is
 * composed into the runtime so handlers can yield WorkspaceContextTag
 * directly.
 */
export function run<A>(program: Effect.Effect<A, CliError | PromptCancelled, AppLayer>): Promise<A>;
export function run<A>(
  program: Effect.Effect<
    A,
    CliError | PromptCancelled,
    AppLayer | Workspace | SourceHostProviders | Scope.Scope
  >,
  options: RunOptions & { readonly workspace: WorkspaceContextOptions },
): Promise<A>;
export function run<A>(
  program: Effect.Effect<
    A,
    CliError | PromptCancelled,
    AppLayer | Workspace | SourceHostProviders | Scope.Scope
  >,
  options?: RunOptions,
): Promise<A> {
  // Resolve flags: explicit flags > defaults
  const flagsInput: CliFlagsInput = options?.flags ?? {
    nonInteractive: Option.none(),
    yes: false,
    force: false,
    preview: false,
  };
  const flagsLayer = cliFlagsLayer(flagsInput);

  const provided = options?.workspace
    ? (() => {
        const wsLayer = Layer.provide(workspaceLayer(options.workspace), flagsLayer);
        const sourceProvidersLayer = Layer.provide(SourceHostProvidersLive, wsLayer);
        return program.pipe(
          Effect.provide(Layer.mergeAll(flagsLayer, wsLayer, sourceProvidersLayer)),
          Effect.scoped,
        );
      })()
    : (program.pipe(Effect.provide(flagsLayer)) as Effect.Effect<
        A,
        CliError | PromptCancelled,
        AppLayer
      >);

  // Classify the error and propagate as a defect so ManagedRuntime can
  // clean up scoped resources before we call process.exit.
  return provided
    .pipe(
      Effect.catchAll((error) => {
        const result = classifyError(error);
        if (result.exitCode !== 0) {
          console.error(result.message);
        }
        return Effect.die({ _tag: "CliExit", exitCode: result.exitCode });
      }),
      Runtime.runPromise,
    )
    .catch((thrown: unknown) => {
      // After runtime cleanup, exit with the classified code
      if (
        thrown !== null &&
        typeof thrown === "object" &&
        "_tag" in thrown &&
        (thrown as { _tag: string })._tag === "CliExit" &&
        "exitCode" in thrown
      ) {
        process.exit((thrown as unknown as { exitCode: number }).exitCode);
      }
      throw thrown;
    });
}
