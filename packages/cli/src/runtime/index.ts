/**
 * CLI Runtime Module
 *
 * Provides centralized Effect runtime configuration for CLI commands.
 * Uses ManagedRuntime for proper lifecycle management and resource cleanup.
 */

import type { HttpClient } from "@effect/platform";
import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as p from "@clack/prompts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import type * as Scope from "effect/Scope";

import * as Option from "effect/Option";

import { type AuthClient, AuthClientLive } from "../auth/auth-client.js";
import { AuthMiddlewareLive, RegistryUrl } from "../auth/auth-middleware.js";
import { type CredentialStore, CredentialStoreLive } from "../auth/credential-store.js";
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
import { TelemetryClient, TelemetryClientLive, resolveTelemetryMode } from "../telemetry/index.js";
import {
  Workspace,
  layer as workspaceLayer,
  type WorkspaceContextOptions,
} from "../workspace/index.js";
import { getBuiltInSources } from "../workspace/source-metadata.js";
import { classifyError } from "./error-handling.js";

/**
 * Default registry URL for auth middleware.
 * Override with AXM_REGISTRY_URL env var for local development.
 */
const DEFAULT_REGISTRY_URL = "https://registry.agentxm.ai";
export const REGISTRY_URL = process.env["AXM_REGISTRY_URL"] ?? DEFAULT_REGISTRY_URL;

/**
 * Standard dependencies available to all CLI commands:
 * - FileSystem, Path (from @effect/platform-node)
 * - HttpClient (auth-wrapped for network requests)
 * - CredentialStore (credential storage)
 * - AuthClient (auth API client)
 * - Clack services (prompts, logging, spinner, stream, progress, task log)
 * - Legacy prompt adapter tags (Confirm/Select/Multiselect/TextInput/PasswordInput)
 */
export type AppLayer =
  | NodeContext.NodeContext
  | HttpClient.HttpClient
  | CredentialStore
  | AuthClient
  | RegistryUrl
  | CliFlags
  | TelemetryClient
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
 * Default telemetry layer for ManagedRuntime (mode "all", command "unknown").
 * Overridden per-invocation in run() with resolved mode and command.
 */
const DefaultTelemetryLayer = Layer.provide(
  TelemetryClientLive("all", "unknown"),
  FetchHttpClient.layer,
);

/**
 * RegistryUrl layer — provides the registry URL for auth middleware.
 * Uses AXM_REGISTRY_URL env var when set, otherwise the default.
 */
const RegistryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);

/**
 * Base layer: platform services + raw HttpClient.
 */
const BaseLayer = Layer.mergeAll(NodeContext.layer, FetchHttpClient.layer);

/**
 * Auth services layer: CredentialStore + AuthClient + RegistryUrl.
 * Both use the raw HttpClient from BaseLayer (before middleware wraps it).
 */
const AuthServicesLayer = Layer.provide(
  Layer.mergeAll(CredentialStoreLive, AuthClientLive, RegistryUrlLayer),
  BaseLayer,
);

/**
 * Auth middleware layer: wraps HttpClient with Bearer token injection.
 * Provided after AuthServicesLayer so it can access CredentialStore and RegistryUrl,
 * but AuthClient retains the raw HttpClient captured at construction time.
 */
const AuthMiddlewareWrappedLayer = Layer.provide(
  AuthMiddlewareLive,
  Layer.mergeAll(AuthServicesLayer, BaseLayer),
);

/**
 * Combined auth layer: AuthServices + AuthMiddleware (replacing HttpClient).
 * Downstream consumers get the auth-wrapped HttpClient.
 */
const AuthLayer = Layer.mergeAll(AuthServicesLayer, AuthMiddlewareWrappedLayer, BaseLayer);

/**
 * Layer providing all standard CLI dependencies.
 * ClackLive depends on CliFlags (for prompt non-interactive guard).
 *
 * Auth services (CredentialStore, AuthClient) are available to all commands.
 * HttpClient is auth-wrapped — downstream consumers get Bearer headers automatically.
 */
export const AppLayer: Layer.Layer<AppLayer> = Layer.mergeAll(
  AuthLayer,
  Layer.provide(ClackLive, DefaultCliFlagsLayer),
  DefaultCliFlagsLayer,
  DefaultTelemetryLayer,
);

/**
 * ManagedRuntime for CLI commands.
 * Handles lifecycle and resource cleanup automatically.
 */
export const Runtime = ManagedRuntime.make(AppLayer);

export interface RunOptions {
  readonly flags?: CliFlagsInput;
  readonly workspace?: WorkspaceContextOptions;
  readonly command?: string;
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
  program: Effect.Effect<A, CliError | PromptCancelled, AppLayer>,
  options: RunOptions,
): Promise<A>;
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
  // Warn when using a non-default registry (e.g. local development)
  if (REGISTRY_URL !== DEFAULT_REGISTRY_URL) {
    p.log.warn(`Using registry: ${REGISTRY_URL}`);
  }

  // Resolve flags: explicit flags > defaults
  const flagsInput: CliFlagsInput = options?.flags ?? {
    nonInteractive: Option.none(),
    yes: false,
    force: false,
    preview: false,
  };
  const flagsLayer = cliFlagsLayer(flagsInput);

  // Resolve telemetry mode and command
  const mode = resolveTelemetryMode(process.env, {});
  const command = options?.command ?? "unknown";
  const telemetryLayer = Layer.provide(TelemetryClientLive(mode, command), FetchHttpClient.layer);

  const provided = options?.workspace
    ? (() => {
        const wsLayer = Layer.provide(
          workspaceLayer({ ...options.workspace, builtInSources: getBuiltInSources(REGISTRY_URL) }),
          flagsLayer,
        );
        const sourceProvidersLayer = Layer.provide(SourceHostProvidersLive, wsLayer);
        return program.pipe(
          Effect.provide(Layer.mergeAll(flagsLayer, wsLayer, sourceProvidersLayer, telemetryLayer)),
          Effect.scoped,
        );
      })()
    : (program.pipe(Effect.provide(Layer.mergeAll(flagsLayer, telemetryLayer))) as Effect.Effect<
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

        // Fire-and-forget error report
        const report =
          error._tag === "CliError"
            ? Effect.gen(function* () {
                const tc = yield* TelemetryClient;
                yield* tc.reportError({
                  name: error.code,
                  message: error.what,
                  details: error.details,
                  ...(Option.isSome(error.howToFix) && { howToFix: error.howToFix.value }),
                  level: "error",
                  handled: true,
                  command,
                });
              }).pipe(Effect.catchAllCause(() => Effect.void))
            : Effect.void;

        return report.pipe(
          Effect.flatMap(() => Effect.die({ _tag: "CliExit", exitCode: result.exitCode })),
        );
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
