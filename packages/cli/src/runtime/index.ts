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

import type { CliError } from "../cli-error/index.js";
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
 * Layer providing all standard CLI dependencies.
 */
export const AppLayer: Layer.Layer<AppLayer> = Layer.mergeAll(
  NodeContext.layer,
  FetchHttpClient.layer,
  ClackLive,
);

/**
 * ManagedRuntime for CLI commands.
 * Handles lifecycle and resource cleanup automatically.
 */
export const Runtime = ManagedRuntime.make(AppLayer);

/**
 * Run an Effect program with CLI dependencies and error handling.
 * Exit codes: 0 (prompt cancelled), 1 (expected error).
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
  options: { readonly workspace: WorkspaceContextOptions },
): Promise<A>;
export function run<A>(
  program: Effect.Effect<
    A,
    CliError | PromptCancelled,
    AppLayer | Workspace | SourceHostProviders | Scope.Scope
  >,
  options?: { readonly workspace: WorkspaceContextOptions },
): Promise<A> {
  const provided = options?.workspace
    ? (() => {
        const wsLayer = workspaceLayer(options.workspace);
        const sourceProvidersLayer = Layer.provide(SourceHostProvidersLive, wsLayer);
        return program.pipe(
          Effect.provide(Layer.mergeAll(wsLayer, sourceProvidersLayer)),
          Effect.scoped,
        );
      })()
    : (program as Effect.Effect<A, CliError | PromptCancelled, AppLayer>);

  return provided.pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        const result = classifyError(error);
        if (result.exitCode !== 0) {
          console.error(result.message);
        }
        return process.exit(result.exitCode);
      }),
    ),
    Runtime.runPromise,
  );
}
