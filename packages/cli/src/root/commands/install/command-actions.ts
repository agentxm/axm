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

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import type { ExtensionName, Handle } from "@agentxm/client-core/unstable/extensions";
import type { VersionConstraint } from "@agentxm/client-core/unstable/version-constraints";
import type { RegistrySource } from "@agentxm/client-core/unstable/sources";
import {
  resolveSource,
  SourceHostProviders,
} from "@agentxm/client-core/unstable/source-resolution";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import {
  CommandManager,
  selectRenderer,
  type CommandExtensionRef,
} from "@agentxm/client-core/unstable/commands";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import { buildInstallOperation } from "@agentxm/client-core/unstable/extensions";
import type { InstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { InstallCommandCommandIntent } from "./intent.js";
import { parseRegistryInstallTarget } from "../../shared/registry-install-target.js";
import { combinePlanSections, makeAgentSection, makeGroupedSection } from "../preview-sections.js";

// -----------------------------------------------------------------------------
// Handler Args
// -----------------------------------------------------------------------------

export interface InstallCommandHandlerArgs {
  readonly source: string;
  /** Auto-accept confirmation prompts. */
  readonly yes: boolean;
  /** Override constraints that would cause failure. */
  readonly force: boolean;
  /** Display plan without applying. */
  readonly preview: boolean;
}

// -----------------------------------------------------------------------------
// Parsed Args
// -----------------------------------------------------------------------------

export interface ParsedCommandInstallArgs {
  readonly owner: Handle;
  readonly commandName: ExtensionName;
  readonly versionConstraint: Option.Option<VersionConstraint>;
  readonly resolvedInput: string;
  readonly force: boolean;
}

// -----------------------------------------------------------------------------
// Source Request
// -----------------------------------------------------------------------------

export interface CommandInstallSourceRequest {
  readonly source: RegistrySource;
  readonly owner: Handle;
  readonly commandName: ExtensionName;
  readonly versionConstraint: Option.Option<VersionConstraint>;
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
>()("axm.sh/InstallCommandCommandWorkflowActions") {}

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
    const ws = yield* WorkspaceMutations;
    const commandMgr = yield* CommandManager;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Build a service layer to provide to inner effects that still require
    // services via the Effect context (e.g. resolveSource).
    const envLayer = Layer.mergeAll(
      Layer.succeed(SourceHostProviders, sources),
      Layer.succeed(WorkspaceMutations, ws),
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );

    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, envLayer);

    const parseArgs = (
      args: InstallCommandHandlerArgs,
    ): Effect.Effect<ParsedCommandInstallArgs, AppError> =>
      Effect.gen(function* () {
        const trimmed = args.source.trim();
        const parsed = parseRegistryInstallTarget(trimmed, {
          expectedType: "command",
          allowBareName: true,
        });

        if (Result.isSuccess(parsed)) {
          if (parsed.success.kind === "registry") {
            return {
              owner: parsed.success.owner,
              commandName: parsed.success.name,
              versionConstraint: Option.fromUndefinedOr(parsed.success.versionConstraint),
              resolvedInput: trimmed,
              force: false,
            };
          }

          const owner = yield* ws.getConfiguredOwner().pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(
                    makeAppError({
                      code: "OWNER_REQUIRED",
                      what: `Cannot resolve bare command name "${parsed.success.name}" without a configured owner`,
                      howToFix:
                        "Use the fully-qualified `@owner/commands/${name}` form, set `owner` in `.axm/settings.json`, or run `axm login`.",
                    }),
                  ),
                onSome: Effect.succeed,
              }),
            ),
          );
          return {
            owner,
            commandName: parsed.success.name,
            versionConstraint: Option.none<VersionConstraint>(),
            resolvedInput: `${owner}/commands/${parsed.success.name}`,
            force: false,
          };
        }

        switch (parsed.failure.kind) {
          case "wrong-type":
            return yield* makeAppError({
              code: "COMMAND_SOURCE_INVALID_FORMAT",
              what: "Command source must include /commands/ segment",
              howToFix: "Use @owner/commands/command-name format.",
            });
          case "missing-name":
            return yield* makeAppError({
              code: "COMMAND_SOURCE_MISSING_NAME",
              what: "Command source must include a command name",
              howToFix: "Use @owner/commands/command-name format.",
            });
          default:
            return yield* makeAppError({
              code: "COMMAND_SOURCE_NOT_REGISTRY",
              what: "Commands can only be installed from a registry",
              howToFix: "Use @owner/commands/command-name or just command-name.",
            });
        }
      });

    const resolveSourceRequests = (
      parsed: ParsedCommandInstallArgs,
    ): Effect.Effect<ReadonlyArray<CommandInstallSourceRequest>, AppError> =>
      provide(
        Effect.gen(function* () {
          const source = yield* resolveSource(parsed.resolvedInput).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "INVALID_SOURCE",
                what: `Invalid source: ${error.message}`,
                howToFix: "Use @owner/commands/command-name or just command-name.",
                cause: error,
              }),
            ),
          );

          if (source.type !== "registry") {
            return yield* makeAppError({
              code: "COMMAND_SOURCE_NOT_REGISTRY",
              what: "Commands can only be installed from a registry",
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
                  names: [req.commandName],
                  type: "command",
                  owner: Option.some(req.owner),
                  versionConstraint: req.versionConstraint,
                })
                .pipe(
                  Effect.mapError((error) =>
                    makeAppError({
                      code: "COMMAND_FETCH_FAILED",
                      what: "Failed to fetch command from registry",
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
      Effect.gen(function* () {
        const configuredAgents = yield* ws.getConfiguredAgents();
        const warningsByAgent: Record<string, ReadonlyArray<string>> = {};

        for (const agentId of configuredAgents) {
          const rendererFn = selectRenderer(agentId);
          if (rendererFn === undefined) continue;
          const output = rendererFn({
            frontmatter: {},
            body: "",
            agentId,
            commandName: intent.ref.command.name,
            agentOverrides: undefined,
          });
          if (output._tag === "Skipped") continue;

          const warnings = output.warnings
            .filter((warning) => warning.feature && warning.message)
            .map((warning) => `${warning.feature} - ${warning.message}`);

          if (warnings.length > 0) {
            warningsByAgent[agentId] = warnings;
          }
        }

        const sections = combinePlanSections(
          makeAgentSection(
            "Target agents",
            configuredAgents,
            "No agents configured. No files would be rendered.",
          ),
          makeGroupedSection("Potential rendering warnings", warningsByAgent),
        );

        return {
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
          ...(sections === undefined ? {} : { sections }),
        } satisfies Plan;
      });

    return {
      parseArgs,
      resolveSourceRequests,
      discoverRefs,
      finalizeIntent,
      buildPlan,
    };
  }),
);
