/**
 * Command install workflow actions service.
 *
 * Implements InstallExtensionCommandWorkflowActions for commands.
 * Commands are registry-only, similar to packs.
 * The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * TODO: (#54) This file shares nearly identical structure with
 * skills/install/command-actions.ts, mcp-servers/install/command-actions.ts,
 * and skills/uninstall/command-actions.ts (layer construction, provide helper,
 * parseArgs, plan building). Consider a generic factory parameterized by
 * extension type.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { Input } from "../../../input/index.js";
import { CliFlags } from "../../../cli-flags/index.js";
import { makeAppError, type AppError } from "../../../app-error/index.js";
import type { PromptCancelled } from "../../../prompt-cancelled.js";
import { parseInputPattern, resolveSource, SourceHostProviders } from "../../../sources/index.js";
import type { CommandExtensionRef, RegistrySource } from "../../../sources/types.js";
import { Workspace } from "../../../workspace/service.js";
import { CommandManager } from "../../../extensions/commands/manager.js";
import type { Plan } from "../../../workspace/plan.js";
import { buildInstallOperation } from "../../../workflows/install-operation/index.js";
import type { InstallExtensionCommandWorkflowActions } from "../../../workflows/install-command/index.js";
import type { WorkspaceScope } from "../../../workspace/scope.js";
import type { InstallCommandCommandIntent } from "./intent.js";

// -----------------------------------------------------------------------------
// Handler Args
// -----------------------------------------------------------------------------

export interface InstallCommandHandlerArgs {
  readonly source: string;
  readonly scope: WorkspaceScope;
}

// -----------------------------------------------------------------------------
// Parsed Args
// -----------------------------------------------------------------------------

export interface ParsedCommandInstallArgs {
  readonly namespace: string;
  readonly commandName: string;
  readonly versionConstraint: Option.Option<string>;
  readonly resolvedInput: string;
  readonly force: boolean;
}

// -----------------------------------------------------------------------------
// Source Request
// -----------------------------------------------------------------------------

export interface CommandInstallSourceRequest {
  readonly source: RegistrySource;
  readonly namespace: string;
  readonly commandName: string;
  readonly versionConstraint: Option.Option<string>;
}

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class InstallCommandCommandWorkflowActions extends ServiceMap.Service<
  InstallCommandCommandWorkflowActions,
  InstallExtensionCommandWorkflowActions<
    InstallCommandHandlerArgs,
    ParsedCommandInstallArgs,
    CommandInstallSourceRequest,
    CommandExtensionRef,
    InstallCommandCommandIntent
  >
>()("@axm.sh/cli/InstallCommandCommandWorkflowActions") {}

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

/**
 * Constructs the actions by resolving all services at layer-build time.
 * Each action method closes over the captured services so `R = never`.
 */
export const InstallCommandCommandWorkflowActionsLive = Layer.effect(
  InstallCommandCommandWorkflowActions,
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders;
    const ws = yield* Workspace;
    const commandMgr = yield* CommandManager;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const input = yield* Input;
    const flags = yield* CliFlags;

    // Build a service layer to provide to inner effects that still require
    // services via the Effect context (e.g. resolveSource).
    const envLayer = Layer.mergeAll(
      Layer.succeed(SourceHostProviders, sources),
      Layer.succeed(Workspace, ws),
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
      Layer.succeed(Input, input),
      Layer.succeed(CliFlags, flags),
    );

    const provide = <A, E>(
      effect: Effect.Effect<
        A,
        E,
        SourceHostProviders | Workspace | FileSystem.FileSystem | Path.Path | Input | CliFlags
      >,
    ): Effect.Effect<A, E, never> => Effect.provide(effect, envLayer);

    const parseArgs = (
      args: InstallCommandHandlerArgs,
    ): Effect.Effect<ParsedCommandInstallArgs, AppError> =>
      Effect.gen(function* () {
        const trimmed = args.source.trim();
        const parsed = parseInputPattern(trimmed);

        // Handle @namespace/commands/name[@version]
        if (Option.isSome(parsed) && parsed.value.pattern.pattern === "registry-pattern-input") {
          const pat = parsed.value.pattern;
          if (Option.isSome(pat.type) && pat.type.value !== "commands") {
            return yield* makeAppError({
              code: "COMMAND_SOURCE_INVALID_FORMAT",
              what: "Command source must include /commands/ segment",
              details: [`Provided: ${trimmed}`],
              howToFix: "Use @namespace/commands/command-name format.",
            });
          }
          if (Option.isNone(pat.name)) {
            return yield* makeAppError({
              code: "COMMAND_SOURCE_MISSING_NAME",
              what: "Command source must include a command name",
              details: [`Provided: ${trimmed}`],
              howToFix: "Use @namespace/commands/command-name format.",
            });
          }
          return {
            namespace: pat.namespace,
            commandName: pat.name.value,
            versionConstraint: pat.versionConstraint,
            resolvedInput: trimmed,
            force: flags.force,
          };
        }

        // Handle bare name (e.g., "my-cmd")
        if (Option.isSome(parsed) && parsed.value.pattern.pattern === "name-input") {
          const namespace = yield* ws.getConfiguredNamespace();
          return {
            namespace,
            commandName: parsed.value.pattern.name,
            versionConstraint: Option.none<string>(),
            resolvedInput: `${namespace}/commands/${parsed.value.pattern.name}`,
            force: flags.force,
          };
        }

        return yield* makeAppError({
          code: "COMMAND_SOURCE_NOT_REGISTRY",
          what: "Commands can only be installed from a registry",
          details: [`Provided: ${trimmed}`],
          howToFix: "Use @namespace/commands/command-name or just command-name.",
        });
      });

    const resolveSourceRequests = (
      parsed: ParsedCommandInstallArgs,
    ): Effect.Effect<ReadonlyArray<CommandInstallSourceRequest>, AppError | PromptCancelled> =>
      provide(
        Effect.gen(function* () {
          const source = yield* resolveSource(parsed.resolvedInput).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "INVALID_SOURCE",
                what: `Invalid source: ${error.message}`,
                details: [`Provided: ${parsed.resolvedInput}`],
                howToFix: "Use @namespace/commands/command-name or just command-name.",
                cause: error,
              }),
            ),
          );

          if (source.type !== "registry") {
            return yield* makeAppError({
              code: "COMMAND_SOURCE_NOT_REGISTRY",
              what: "Commands can only be installed from a registry",
              details: [`Provided source type: ${source.type}`],
              howToFix: "Use a registry source: @namespace/commands/command-name",
            });
          }

          return [
            {
              source,
              namespace: parsed.namespace,
              commandName: parsed.commandName,
              versionConstraint: parsed.versionConstraint,
            },
          ];
        }),
      );

    const discoverRefs = (
      reqs: ReadonlyArray<CommandInstallSourceRequest>,
    ): Effect.Effect<ReadonlyArray<CommandExtensionRef>, AppError> =>
      Effect.scoped(
        Effect.gen(function* () {
          const allRefs = yield* Effect.forEach(
            reqs,
            (req) =>
              sources
                .find(req.source, {
                  skillNames: [req.commandName],
                  type: "command",
                  namespace: Option.some(req.namespace),
                  versionConstraint: req.versionConstraint,
                })
                .pipe(
                  Effect.mapError((error) =>
                    makeAppError({
                      code: "COMMAND_FETCH_FAILED",
                      what: "Failed to fetch command from registry",
                      details: [`Command: ${req.namespace}/commands/${req.commandName}`],
                      howToFix: "Verify the command name and registry configuration.",
                      cause: error,
                    }),
                  ),
                ),
            { concurrency: "unbounded" },
          );
          return allRefs.flat().filter((ref): ref is CommandExtensionRef => ref.type === "command");
        }),
      );

    const finalizeIntent = (
      parsed: ParsedCommandInstallArgs,
      refs: ReadonlyArray<CommandExtensionRef>,
    ): Effect.Effect<InstallCommandCommandIntent, AppError> =>
      Effect.gen(function* () {
        if (refs.length === 0) {
          return yield* makeAppError({
            code: "COMMAND_NOT_FOUND",
            what: `Command "${parsed.commandName}" not found in registry`,
            howToFix: "Verify the command name and check available commands.",
          });
        }
        return {
          ref: refs[0]!,
          versionConstraint: parsed.versionConstraint,
          force: parsed.force,
        };
      });

    const buildPlan = (intent: InstallCommandCommandIntent): Effect.Effect<Plan, AppError> =>
      Effect.succeed({
        _tag: "Plan",
        name: "Install command",
        description: Option.some(`Install command ${intent.ref.command.name}`),
        jobs: [
          {
            concurrency: 1 as const,
            steps: [
              buildInstallOperation(commandMgr, {
                ref: intent.ref,
                versionConstraint: intent.versionConstraint,
              }),
            ],
          },
        ],
      } satisfies Plan);

    return {
      parseArgs,
      resolveSourceRequests,
      discoverRefs,
      finalizeIntent,
      buildPlan,
    };
  }),
);
