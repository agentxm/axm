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
import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";

import { makeAppError, type AppError } from "@axm.sh/core/unstable/app-error";
import type { Handle } from "@axm.sh/core/unstable/extensions";
import type { PromptCancelled } from "@axm.sh/core/unstable/prompt-cancelled";
import { parseInputPattern } from "@axm.sh/core/unstable/sources";
import type { RegistrySource } from "@axm.sh/core/unstable/sources";
import { resolveSource, SourceHostProviders } from "@axm.sh/core/unstable/source-resolution";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import { CommandManager, type CommandExtensionRef } from "@axm.sh/core/unstable/commands";
import type { Plan } from "@axm.sh/core/unstable/workspace";
import { buildInstallOperation } from "@axm.sh/core/unstable/extensions";
import type { InstallExtensionCommandWorkflowActions } from "@axm.sh/core/unstable/workflows";
import type { InstallCommandCommandIntent } from "./intent.js";

// -----------------------------------------------------------------------------
// Handler Args
// -----------------------------------------------------------------------------

export interface InstallCommandHandlerArgs {
  readonly source: string;
}

// -----------------------------------------------------------------------------
// Parsed Args
// -----------------------------------------------------------------------------

export interface ParsedCommandInstallArgs {
  readonly owner: Handle;
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
  readonly owner: Handle;
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
    const prompt = yield* CliPrompt;

    // Build a service layer to provide to inner effects that still require
    // services via the Effect context (e.g. resolveSource).
    const envLayer = Layer.mergeAll(
      Layer.succeed(SourceHostProviders, sources),
      Layer.succeed(Workspace, ws),
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
      Layer.succeed(CliPrompt, prompt),
    );

    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, envLayer);

    const parseArgs = (
      args: InstallCommandHandlerArgs,
    ): Effect.Effect<ParsedCommandInstallArgs, AppError> =>
      Effect.gen(function* () {
        const trimmed = args.source.trim();
        const parsed = parseInputPattern(trimmed);

        // Handle @owner/commands/name[@version]
        if (Option.isSome(parsed) && parsed.value.pattern.pattern === "registry-pattern-input") {
          const pat = parsed.value.pattern;
          if (Option.isSome(pat.type) && pat.type.value !== "commands") {
            return yield* makeAppError({
              code: "COMMAND_SOURCE_INVALID_FORMAT",
              what: "Command source must include /commands/ segment",
              details: [`Provided: ${trimmed}`],
              howToFix: "Use @owner/commands/command-name format.",
            });
          }
          if (Option.isNone(pat.name)) {
            return yield* makeAppError({
              code: "COMMAND_SOURCE_MISSING_NAME",
              what: "Command source must include a command name",
              details: [`Provided: ${trimmed}`],
              howToFix: "Use @owner/commands/command-name format.",
            });
          }
          return {
            owner: pat.owner,
            commandName: pat.name.value,
            versionConstraint: pat.versionConstraint,
            resolvedInput: trimmed,
            force: false,
          };
        }

        // Handle bare name (e.g., "my-cmd")
        if (Option.isSome(parsed) && parsed.value.pattern.pattern === "name-input") {
          const owner = yield* ws.getConfiguredProfile();
          return {
            owner,
            commandName: parsed.value.pattern.name,
            versionConstraint: Option.none<string>(),
            resolvedInput: `${owner}/commands/${parsed.value.pattern.name}`,
            force: false,
          };
        }

        return yield* makeAppError({
          code: "COMMAND_SOURCE_NOT_REGISTRY",
          what: "Commands can only be installed from a registry",
          details: [`Provided: ${trimmed}`],
          howToFix: "Use @owner/commands/command-name or just command-name.",
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
                howToFix: "Use @owner/commands/command-name or just command-name.",
                cause: error,
              }),
            ),
          );

          if (source.type !== "registry") {
            return yield* makeAppError({
              code: "COMMAND_SOURCE_NOT_REGISTRY",
              what: "Commands can only be installed from a registry",
              details: [`Provided source type: ${source.type}`],
              howToFix: "Use a registry source: @owner/commands/command-name",
            });
          }

          return [
            {
              source,
              owner: parsed.owner,
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
                  owner: Option.some(req.owner),
                  versionConstraint: req.versionConstraint,
                })
                .pipe(
                  Effect.mapError((error) =>
                    makeAppError({
                      code: "COMMAND_FETCH_FAILED",
                      what: "Failed to fetch command from registry",
                      details: [`Command: ${req.owner}/commands/${req.commandName}`],
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
        const [ref] = refs;
        if (ref === undefined) {
          return yield* makeAppError({
            code: "COMMAND_NOT_FOUND",
            what: `Command "${parsed.commandName}" not found in registry`,
            howToFix: "Verify the command name and check available commands.",
          });
        }
        return {
          ref,
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
