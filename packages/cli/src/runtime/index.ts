/**
 * CLI Runtime Module
 *
 * Provides centralized Effect runtime configuration for CLI commands.
 * Uses ManagedRuntime for proper lifecycle management and resource cleanup.
 */

import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as p from "@clack/prompts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
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
import { CliEnvConfig, CliEnvConfigLive } from "../config/index.js";
import type { PromptCancelled } from "../prompt-cancelled.js";
import { type SourceHostProviders, SourceHostProvidersLive } from "../sources/index.js";
import { TelemetryClient, TelemetryClientLive, resolveTelemetryMode } from "../telemetry/index.js";
import {
  Workspace,
  layer as workspaceLayer,
  type WorkspaceContextOptions,
} from "../workspace/index.js";
import { getBuiltInSources } from "../workspace/source-metadata.js";
import { classifyError, resolveDiagnosticVerbosity } from "./error-handling.js";

/**
 * Default registry URL for auth middleware.
 * Override with AXM_REGISTRY_URL env var for local development.
 */
const DEFAULT_REGISTRY_URL = "https://registry.agentxm.ai";

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
  | NodeServices.NodeServices
  | HttpClient.HttpClient
  | CredentialStore
  | AuthClient
  | RegistryUrl
  | CliFlags
  | CliEnvConfig
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
 * CliEnvConfigLive with ConfigError converted to defect — config failures at
 * startup are unrecoverable so they should crash immediately.
 */
const CliEnvConfigOrDie: Layer.Layer<CliEnvConfig> = Layer.orDie(CliEnvConfigLive);

/**
 * Default CliFlags layer using auto-detection for nonInteractive.
 * Overridden per-invocation in run() when flags are provided.
 */
const DefaultCliFlagsLayer = Layer.provide(
  cliFlagsLayer({
    nonInteractive: Option.none(),
    yes: false,
    force: false,
    preview: false,
  }),
  CliEnvConfigOrDie,
);

/**
 * Default telemetry layer for ManagedRuntime (mode "all", command "unknown").
 * Overridden per-invocation in run() with resolved mode and command.
 */
const DefaultTelemetryLayer = Layer.provide(
  TelemetryClientLive("all", "unknown"),
  Layer.mergeAll(FetchHttpClient.layer, CliEnvConfigOrDie),
);

/**
 * RegistryUrl layer — provides the registry URL for auth middleware.
 * Reads from CliEnvConfig (which resolves AXM_REGISTRY_URL), otherwise the default.
 */
const RegistryUrlLayer = Layer.effect(
  RegistryUrl,
  Effect.map(CliEnvConfig.asEffect(), (cfg) => cfg.registryUrl),
);

/**
 * Base layer: platform services + raw HttpClient.
 */
const BaseLayer = Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer);

/**
 * Auth services layer: CredentialStore + AuthClient + RegistryUrl.
 * Both use the raw HttpClient from BaseLayer (before middleware wraps it).
 * RegistryUrlLayer depends on CliEnvConfigLive for the URL value.
 */
const AuthServicesLayer = Layer.provide(
  Layer.mergeAll(CredentialStoreLive, AuthClientLive, RegistryUrlLayer),
  Layer.mergeAll(BaseLayer, CliEnvConfigOrDie),
);

/**
 * Auth middleware layer: wraps HttpClient with Bearer token injection.
 * Provided after AuthServicesLayer so it can access CredentialStore and RegistryUrl,
 * but AuthClient retains the raw HttpClient captured at construction time.
 */
const AuthMiddlewareWrappedLayer = Layer.provide(
  AuthMiddlewareLive,
  Layer.mergeAll(AuthServicesLayer, BaseLayer, CliEnvConfigOrDie),
);

/**
 * Combined auth layer: AuthServices + auth-wrapped HttpClient + platform services.
 * Exposes NodeServices plus the wrapped client, without re-exporting the raw one.
 */
const AuthLayer = Layer.mergeAll(NodeServices.layer, AuthServicesLayer, AuthMiddlewareWrappedLayer);

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
  CliEnvConfigOrDie,
  Logger.layer([], { mergeWithExisting: false }),
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

interface ResolvedConfigValues {
  readonly registryUrl: string;
  readonly doNotTrack: string | undefined;
  readonly axmTelemetry: string | undefined;
  readonly AXM_VERBOSE: string | undefined;
  readonly AXM_DEBUG: string | undefined;
}

interface CliExit {
  readonly _tag: "CliExit";
  readonly exitCode: number;
}

const defaultFlagsInput: CliFlagsInput = {
  nonInteractive: Option.none(),
  yes: false,
  force: false,
  preview: false,
};

const resolveConfigValues: Effect.Effect<ResolvedConfigValues> = Effect.provide(
  Effect.gen(function* () {
    const cfg = yield* CliEnvConfig;
    return {
      registryUrl: cfg.registryUrl,
      doNotTrack: Option.getOrUndefined(cfg.doNotTrack),
      axmTelemetry: Option.getOrUndefined(cfg.telemetry),
      AXM_VERBOSE: Option.getOrUndefined(cfg.verbose),
      AXM_DEBUG: Option.getOrUndefined(cfg.debug),
    } satisfies ResolvedConfigValues;
  }),
  CliEnvConfigOrDie,
);

const isCliExit = (value: unknown): value is CliExit =>
  value !== null &&
  typeof value === "object" &&
  "_tag" in value &&
  value._tag === "CliExit" &&
  "exitCode" in value &&
  typeof value.exitCode === "number";

export function withCliRuntime<A>(
  program: Effect.Effect<A, CliError | PromptCancelled, AppLayer>,
): Effect.Effect<A, never, AppLayer>;
export function withCliRuntime<A>(
  program: Effect.Effect<A, CliError | PromptCancelled, AppLayer>,
  options: RunOptions,
): Effect.Effect<A, never, AppLayer>;
export function withCliRuntime<A>(
  program: Effect.Effect<
    A,
    CliError | PromptCancelled,
    AppLayer | Workspace | SourceHostProviders | Scope.Scope
  >,
  options: RunOptions & { readonly workspace: WorkspaceContextOptions },
): Effect.Effect<A, never, AppLayer>;
export function withCliRuntime<A>(
  program: Effect.Effect<
    A,
    CliError | PromptCancelled,
    AppLayer | Workspace | SourceHostProviders | Scope.Scope
  >,
  options?: RunOptions,
): Effect.Effect<A, never, AppLayer> {
  return Effect.gen(function* () {
    const flagsInput = options?.flags ?? defaultFlagsInput;
    const flagsLayer = Layer.provide(cliFlagsLayer(flagsInput), CliEnvConfigOrDie);
    const configValues = yield* resolveConfigValues;

    if (configValues.registryUrl !== DEFAULT_REGISTRY_URL) {
      yield* Effect.sync(() => {
        p.log.warn(`Using registry: ${configValues.registryUrl}`);
      });
    }

    const mode = resolveTelemetryMode(
      { doNotTrack: configValues.doNotTrack, axmTelemetry: configValues.axmTelemetry },
      {},
    );
    const command = options?.command ?? "unknown";
    const telemetryLayer = Layer.provide(
      TelemetryClientLive(mode, command),
      Layer.mergeAll(FetchHttpClient.layer, CliEnvConfigOrDie),
    );

    const diagnosticVerbosity = resolveDiagnosticVerbosity(process.argv, {
      AXM_VERBOSE: configValues.AXM_VERBOSE,
      AXM_DEBUG: configValues.AXM_DEBUG,
    });
    const debugLoggerLayer = diagnosticVerbosity.debug
      ? Logger.layer([Logger.consolePretty()], { mergeWithExisting: false })
      : Layer.empty;

    const provided: Effect.Effect<A, CliError | PromptCancelled, AppLayer> = options?.workspace
      ? (() => {
          const wsLayer = Layer.provide(
            workspaceLayer({
              ...options.workspace,
              builtInSources: getBuiltInSources(configValues.registryUrl),
            }),
            Layer.mergeAll(flagsLayer, CliEnvConfigOrDie),
          );
          const sourceProvidersLayer = Layer.provide(SourceHostProvidersLive, wsLayer);
          return program.pipe(
            Effect.provide(
              Layer.mergeAll(
                flagsLayer,
                wsLayer,
                sourceProvidersLayer,
                telemetryLayer,
                debugLoggerLayer,
              ),
            ),
            Effect.scoped,
          ) as Effect.Effect<A, CliError | PromptCancelled, AppLayer>;
        })()
      : (program.pipe(
          Effect.provide(Layer.mergeAll(flagsLayer, telemetryLayer, debugLoggerLayer)),
        ) as Effect.Effect<A, CliError | PromptCancelled, AppLayer>);

    return yield* provided.pipe(
      Effect.catch((error: CliError | PromptCancelled) => {
        const result = classifyError(error, diagnosticVerbosity);
        const writeError =
          result.exitCode === 0
            ? Effect.void
            : Effect.sync(() => {
                console.error(result.message);
              });

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
              }).pipe(Effect.catchCause(() => Effect.void))
            : Effect.void;

        return writeError.pipe(
          Effect.andThen(report),
          Effect.flatMap(() => Effect.die({ _tag: "CliExit", exitCode: result.exitCode } as const)),
        );
      }),
    );
  });
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
export async function run<A>(
  program: Effect.Effect<
    A,
    CliError | PromptCancelled,
    AppLayer | Workspace | SourceHostProviders | Scope.Scope
  >,
  options?: RunOptions,
): Promise<A> {
  const prepared =
    options === undefined
      ? withCliRuntime(program as Effect.Effect<A, CliError | PromptCancelled, AppLayer>)
      : options.workspace === undefined
        ? withCliRuntime(program as Effect.Effect<A, CliError | PromptCancelled, AppLayer>, options)
        : withCliRuntime(
            program,
            options as RunOptions & { readonly workspace: WorkspaceContextOptions },
          );

  return Runtime.runPromise(prepared).catch((thrown: unknown) => {
    // After runtime cleanup, exit with the classified code
    if (isCliExit(thrown)) {
      process.exit(thrown.exitCode);
    }
    throw thrown;
  });
}
