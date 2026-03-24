/**
 * Command Runtime — shared infrastructure for CLI command files.
 *
 * Extracted from cli.ts to avoid circular imports: command files import from
 * here, and cli.ts imports command files. Both directions are acyclic.
 *
 * Provides:
 * - Global flag definitions (yielded by command handlers)
 * - Base layer (services provided once at run() boundary)
 * - withCommandRuntime() (per-command service provision + error handling)
 */

import type * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import { Command, Flag, GlobalFlag } from "effect/unstable/cli";

import type { AuthClient, CredentialStore, RegistryUrl } from "./auth/index.js";
import type { AppError } from "./app-error/index.js";
import type { PromptCancelled } from "./prompt-cancelled.js";

import {
  type CliRuntimeFoundation,
  type EffectCliExit,
  effectCliExit,
  isEffectCliExit,
  type CliTelemetryConfigService,
  makeCliRuntimeContext,
  runCliRuntime,
} from "@axm.sh/core/unstable/cli-runtime";
import { nonInteractiveFlag, outputFormatFlag } from "@axm.sh/core/unstable/cli-flags";
import {
  InstallCommandCommandWorkflowActionsLive,
  type InstallCommandCommandWorkflowActions,
} from "./cli-commands/commands/install/command-actions.js";
import {
  UninstallCommandCommandWorkflowActionsLive,
  type UninstallCommandCommandWorkflowActions,
} from "./cli-commands/commands/uninstall/command-actions.js";
import {
  InstallMcpServerCommandWorkflowActionsLive,
  type InstallMcpServerCommandWorkflowActions,
} from "./cli-commands/mcp-servers/install/command-actions.js";
import {
  UninstallMcpServerCommandWorkflowActionsLive,
  type UninstallMcpServerCommandWorkflowActions,
} from "./cli-commands/mcp-servers/uninstall/command-actions.js";
import {
  InstallPackCommandWorkflowActionsLive,
  type InstallPackCommandWorkflowActions,
} from "./cli-commands/packs/install/command-actions.js";
import {
  UninstallPackCommandWorkflowActionsLive,
  type UninstallPackCommandWorkflowActions,
} from "./cli-commands/packs/uninstall/command-actions.js";
import {
  InstallSkillCommandWorkflowActionsLive,
  type InstallSkillCommandWorkflowActions,
} from "./cli-commands/skills/install/command-actions.js";
import {
  UninstallSkillCommandWorkflowActionsLive,
  type UninstallSkillCommandWorkflowActions,
} from "./cli-commands/skills/uninstall/command-actions.js";
import { CliEnvConfig, type CliEnvConfigService } from "./config/index.js";
import { CommandManagerLive, type CommandManager } from "./extensions/commands/manager.js";
import { McpServerManagerLive, type McpServerManager } from "./extensions/mcp-servers/manager.js";
import { PackManagerLive, type PackManager } from "./extensions/packs/manager.js";
import { SkillManagerLive, type SkillManager } from "./extensions/skills/manager.js";
import { SourceHostProviders, SourceHostProvidersLive } from "./sources/index.js";
import { resolveTelemetryMode } from "./telemetry/index.js";
import {
  type DiagnosticVerbosity,
  resolveDiagnosticVerbosity,
} from "./runtime/error-handling.js";
import { baseLayer, CliEnvConfigOrDie } from "./runtime/base-layer.js";
import { Workspace, layer as workspaceLayer, type WorkspaceContextOptions } from "./workspace/index.js";
import { loadVersion } from "./version.js";
import { getBuiltInSources } from "./workspace/source-metadata.js";

// Re-export for consumers that import from command-runtime
export { type EffectCliExit, effectCliExit, isEffectCliExit, outputFormatFlag };

// ---------------------------------------------------------------------------
// Global flags
// ---------------------------------------------------------------------------

export const verboseFlag = GlobalFlag.setting("axm-verbose")({
  flag: Flag.boolean("verbose").pipe(
    Flag.withAlias("v"),
    Flag.withDescription("Show additional diagnostic details for errors"),
  ),
});

export const debugFlag = GlobalFlag.setting("axm-debug")({
  flag: Flag.boolean("debug").pipe(
    Flag.withDescription("Show full debug details for errors (implies --verbose)"),
  ),
});

export const axmGlobalFlags = [
  nonInteractiveFlag,
  verboseFlag,
  debugFlag,
  outputFormatFlag,
] as const;

// ---------------------------------------------------------------------------
// Help display — parent commands show help via the root command ref
//
// cliCommandRef is populated by cli.ts after the root command is built.
// Parent commands call showHelpFor() lazily so the ref is always available
// by the time any command handler runs.
// ---------------------------------------------------------------------------

type AnyCommand = Command.Command.Any;

export const cliCommandRef: { current: AnyCommand | undefined } = { current: undefined };

export const showHelpFor = (commandPath: ReadonlyArray<string>) =>
  Effect.suspend(() => {
    if (cliCommandRef.current === undefined) {
      return Effect.die(new Error("CLI command not initialized"));
    }
    return GlobalFlag.Help.run(true, {
      command: cliCommandRef.current,
      commandPath,
      version: loadVersion(),
    });
  });

// ---------------------------------------------------------------------------
// Layer composition — base services provided once at run() boundary
// ---------------------------------------------------------------------------

export { baseLayer };

// ---------------------------------------------------------------------------
// Unified command runtime — resolves global flags and provides per-command
// services (CliFlags, Output/Activity/Input, Telemetry) within the Effect context.
//
// Optionally provides Workspace + SourceHostProviders when workspace options
// are passed (task 2.4 — workspace as scoped layer).
// ---------------------------------------------------------------------------

export interface CommandRuntimeOptions {
  readonly command?: string;
  readonly isLongRunning?: boolean;
  readonly workspace?: Omit<WorkspaceContextOptions, "builtInSources">;
  readonly flags?: {
    readonly yes?: boolean;
    readonly force?: boolean;
    readonly preview?: boolean;
  };
}

type CommandRuntimeRootServices =
  | AuthClient
  | CliEnvConfig
  | CredentialStore
  | HttpClient.HttpClient
  | NodeServices.NodeServices
  | RegistryUrl;

type WorkspaceCommandServices =
  | Workspace
  | SourceHostProviders
  | SkillManager
  | PackManager
  | CommandManager
  | McpServerManager
  | InstallSkillCommandWorkflowActions
  | UninstallSkillCommandWorkflowActions
  | InstallCommandCommandWorkflowActions
  | UninstallCommandCommandWorkflowActions
  | InstallPackCommandWorkflowActions
  | UninstallPackCommandWorkflowActions
  | InstallMcpServerCommandWorkflowActions
  | UninstallMcpServerCommandWorkflowActions;

type CommandRuntimeServices =
  | CliRuntimeFoundation
  | CommandRuntimeRootServices
  | Scope.Scope
  | WorkspaceCommandServices;

const makeDebugLoggerLayer = (diagnosticVerbosity: DiagnosticVerbosity) =>
  diagnosticVerbosity.debug
    ? Logger.layer([Logger.consolePretty()], { mergeWithExisting: false })
    : Layer.empty;

const makeCliTelemetryConfig = (envConfig: CliEnvConfigService): CliTelemetryConfigService => ({
  mode: resolveTelemetryMode(
    {
      doNotTrack: Option.getOrUndefined(envConfig.doNotTrack),
      axmTelemetry: Option.getOrUndefined(envConfig.telemetry),
    },
    {},
  ),
  client: { name: "cli", version: loadVersion() },
  runtime: { name: "bun", version: process.versions["bun"] ?? "unknown" },
  ci: envConfig.ci === "true",
  test: envConfig.vitest === "true",
});

const makeWorkspaceProgramLayer = (
  envConfig: CliEnvConfigService,
  workspace: Omit<WorkspaceContextOptions, "builtInSources">,
  debugLoggerLayer: Layer.Layer<never>,
) => {
  const wsLayer = Layer.provide(
    workspaceLayer({
      ...workspace,
      builtInSources: getBuiltInSources(envConfig.registryUrl),
    }),
    CliEnvConfigOrDie,
  );
  const sourceProvidersLayer = Layer.provide(SourceHostProvidersLive, wsLayer);
  const workspaceServiceLayer = Layer.mergeAll(wsLayer, sourceProvidersLayer);
  const managerLayer = Layer.mergeAll(
    Layer.provide(CommandManagerLive, wsLayer),
    Layer.provide(McpServerManagerLive, wsLayer),
    Layer.provide(SkillManagerLive, workspaceServiceLayer),
    Layer.provide(PackManagerLive, workspaceServiceLayer),
  );
  const workspaceCommandSupportLayer = Layer.mergeAll(workspaceServiceLayer, managerLayer);
  const workflowActionsLayer = Layer.mergeAll(
    Layer.provide(InstallSkillCommandWorkflowActionsLive, workspaceCommandSupportLayer),
    Layer.provide(UninstallSkillCommandWorkflowActionsLive, workspaceCommandSupportLayer),
    Layer.provide(InstallCommandCommandWorkflowActionsLive, workspaceCommandSupportLayer),
    Layer.provide(UninstallCommandCommandWorkflowActionsLive, workspaceCommandSupportLayer),
    Layer.provide(InstallPackCommandWorkflowActionsLive, workspaceCommandSupportLayer),
    Layer.provide(UninstallPackCommandWorkflowActionsLive, workspaceCommandSupportLayer),
    Layer.provide(InstallMcpServerCommandWorkflowActionsLive, workspaceCommandSupportLayer),
    Layer.provide(UninstallMcpServerCommandWorkflowActionsLive, workspaceCommandSupportLayer),
  );

  return Layer.mergeAll(
    debugLoggerLayer,
    workspaceCommandSupportLayer,
    workflowActionsLayer,
  );
};

const resolveCommandRuntime = (options?: CommandRuntimeOptions) =>
  Effect.gen(function* () {
    const envConfig = yield* CliEnvConfig;
    const diagnosticVerbosity = resolveDiagnosticVerbosity(process.argv, {
      AXM_VERBOSE: Option.getOrUndefined(envConfig.verbose),
      AXM_DEBUG: Option.getOrUndefined(envConfig.debug),
    });
    const debugLoggerLayer = makeDebugLoggerLayer(diagnosticVerbosity);
    const programLayer =
      options?.workspace === undefined
        ? debugLoggerLayer
        : makeWorkspaceProgramLayer(envConfig, options.workspace, debugLoggerLayer);

    return {
      ci: envConfig.ci === "true",
      diagnosticVerbosity,
      telemetryConfig: makeCliTelemetryConfig(envConfig),
      programLayer,
    } as const;
  });

export const withCommandRuntime = (
  program: Effect.Effect<void, AppError | PromptCancelled, CommandRuntimeServices>,
  options?: CommandRuntimeOptions,
): Effect.Effect<void, unknown, CommandRuntimeRootServices> =>
  (Effect.gen(function* () {
    const resolvedRuntime = yield* resolveCommandRuntime(options);
    const runtime = yield* makeCliRuntimeContext({
      isLongRunning: options?.isLongRunning,
      ci: resolvedRuntime.ci,
      flags: options?.flags,
    });

    yield* runCliRuntime(program, {
      command: options?.command,
      runtime,
      telemetryConfig: resolvedRuntime.telemetryConfig,
      appErrorRenderOptions: resolvedRuntime.diagnosticVerbosity,
      programLayer: resolvedRuntime.programLayer,
    });
  }) as Effect.Effect<void, unknown, CommandRuntimeRootServices>);
