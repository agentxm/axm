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

import { ClackLive, type Clack } from "../clack-effect/service.js";
import { LockfileService, LockfileServiceLive } from "../lockfile/index.js";
import { SettingsService, SettingsServiceLive } from "../settings/index.js";
import {
  WorkspaceContextTag,
  layer as workspaceLayer,
  type WorkspaceContextOptions,
} from "../workspace/index.js";

/**
 * Standard dependencies available to all CLI commands:
 * - FileSystem, Path (from @effect/platform-node)
 * - HttpClient (for network requests)
 * - Clack (interactive prompts)
 */
export type AppLayer = NodeContext.NodeContext | HttpClient.HttpClient | Clack;

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
 * Exits process with code 1 on failure.
 *
 * When workspace options are provided, the WorkspaceContext layer is
 * composed into the runtime so handlers can yield WorkspaceContextTag
 * directly.
 */
export function run<A, E>(program: Effect.Effect<A, E, AppLayer>): Promise<A>;
export function run<A, E>(
  program: Effect.Effect<A, E, AppLayer | WorkspaceContextTag | SettingsService | LockfileService>,
  options: { readonly workspace: WorkspaceContextOptions },
): Promise<A>;
export function run<A, E>(
  program: Effect.Effect<A, E, AppLayer | WorkspaceContextTag | SettingsService | LockfileService>,
  options?: { readonly workspace: WorkspaceContextOptions },
): Promise<A> {
  const provided = options?.workspace
    ? (() => {
        const wsLayer = workspaceLayer(options.workspace);
        const servicesLayer = Layer.provide(
          Layer.mergeAll(SettingsServiceLive, LockfileServiceLive),
          wsLayer,
        );
        return program.pipe(Effect.provide(Layer.merge(wsLayer, servicesLayer)));
      })()
    : (program as Effect.Effect<A, E, AppLayer>);

  return provided.pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error(error);
        process.exit(1);
      }),
    ),
    Runtime.runPromise,
  );
}
