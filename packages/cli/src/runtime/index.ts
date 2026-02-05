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
 */
export const run = <A, E>(program: Effect.Effect<A, E, AppLayer>): Promise<A> =>
  program.pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error(error);
        process.exit(1);
      }),
    ),
    Runtime.runPromise,
  );
