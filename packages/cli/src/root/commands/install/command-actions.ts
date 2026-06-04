/**
 * Command install workflow actions service.
 *
 * Implements InstallExtensionCommandWorkflowActions for commands.
 * Commands are registry-only, similar to packs.
 * The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * TODO: (#54) This file shares nearly identical structure with
 * skills/install/command-actions.ts, mcps/install/command-actions.ts,
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
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";
import { parseInputPattern, type Source } from "@agentxm/client-core/unstable/sources";
import {
  resolveSource,
  resolveIdentifier,
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
  readonly source: Source;
  readonly owner: Option.Option<Handle>;
  readonly commandNames: ReadonlyArray<ExtensionName>;
  readonly versionRange: Option.Option<VersionRange>;
  readonly force: boolean;
}

// -----------------------------------------------------------------------------
// Source Request
// -----------------------------------------------------------------------------

export interface CommandInstallSourceRequest {
  readonly source: Source;
  readonly owner: Option.Option<Handle>;
  readonly commandNames: ReadonlyArray<ExtensionName>;
  readonly versionRange: Option.Option<VersionRange>;
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
>()("axm.sh/root/commands/install/command-actions/InstallCommandCommandWorkflowActions") {}

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
      provide(
        Effect.gen(function* () {
          const trimmed = args.source.trim();
          const parsedInput = parseInputPattern(trimmed);
          if (Option.isSome(parsedInput)) {
            switch (parsedInput.value.pattern.pattern) {
              case "file-path-pattern":
              case "url-input":
              case "git-scp-address":
              case "shorthand-input":
              case "slash-pattern": {
                const source = yield* resolveSource(trimmed);
                return {
                  source,
                  owner: source.type === "registry" ? source.owner : Option.none<Handle>(),
                  commandNames: [],
                  versionRange: Option.none<VersionRange>(),
                  force: false,
                } satisfies ParsedCommandInstallArgs;
              }
              case "name-input":
              case "glob-input":
              case "registry-pattern-input":
                break;
            }
          }

          const parsed = parseRegistryInstallTarget(trimmed, {
            expectedType: "command",
            allowBareName: true,
          });

          if (Result.isSuccess(parsed)) {
            if (parsed.success.kind === "registry") {
              const source = yield* resolveSource(trimmed);
              return {
                source,
                owner: Option.some(parsed.success.owner),
                commandNames: [parsed.success.name],
                versionRange: Option.fromUndefinedOr(parsed.success.versionRange),
                force: false,
              };
            }

            const resolvedResult = yield* Effect.result(
              resolveIdentifier({
                input: parsed.success.name,
                resourceType: "command",
                scope: "registry",
              }),
            );
            if (Result.isFailure(resolvedResult)) {
              if (resolvedResult.failure.code !== "not_found") {
                return yield* resolvedResult.failure;
              }
              const configuredOwner = yield* ws.getConfiguredOwner();
              if (Option.isSome(configuredOwner)) {
                const resolvedInput = `${configuredOwner.value}/commands/${parsed.success.name}`;
                const source = yield* resolveSource(resolvedInput);
                return {
                  source,
                  owner: Option.some(configuredOwner.value),
                  commandNames: [parsed.success.name],
                  versionRange: Option.none<VersionRange>(),
                  force: false,
                };
              }
              return yield* resolvedResult.failure;
            }
            const resolved = resolvedResult.success;
            const owner = Option.getOrUndefined(resolved.owner);
            if (owner === undefined) {
              return yield* makeAppError({
                code: "not_found",
                detail: `Command "${parsed.success.name}" not found in registry`,
                suggestions: [
                  {
                    description: "Verify the command name, or use @owner/commands/command-name.",
                  },
                ],
              });
            }
            const source = yield* resolveSource(resolved.fqn);
            return {
              source,
              owner: Option.some(owner),
              commandNames: [parsed.success.name],
              versionRange: Option.none<VersionRange>(),
              force: false,
            };
          }

          switch (parsed.failure.kind) {
            case "wrong-type":
              return yield* makeAppError({
                code: "validation",
                detail: "Command source must include /commands/ segment",
                suggestions: [{ description: "Use @owner/commands/command-name format." }],
              });
            case "missing-name":
              return yield* makeAppError({
                code: "not_found",
                detail: "Command source must include a command name",
                suggestions: [{ description: "Use @owner/commands/command-name format." }],
              });
            default:
              return yield* makeAppError({
                code: "usage",
                detail: "Commands can only be installed from a registry",
                suggestions: [
                  {
                    description: "Use @owner/commands/command-name or just command-name.",
                  },
                ],
              });
          }
        }),
      );

    const resolveSourceRequests = (
      parsed: ParsedCommandInstallArgs,
    ): Effect.Effect<ReadonlyArray<CommandInstallSourceRequest>, AppError> =>
      Effect.succeed([
        {
          source: parsed.source,
          owner: parsed.owner,
          commandNames: parsed.commandNames,
          versionRange: parsed.versionRange,
        },
      ]);

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
                  names: req.commandNames,
                  type: "command",
                  owner: req.owner,
                  versionRange: req.versionRange,
                })
                .pipe(
                  Effect.mapError((error) =>
                    makeAppError({
                      code: "network",
                      detail: "Command could not be fetched from registry",
                      suggestions: [
                        {
                          description: "Verify the command name and registry configuration.",
                        },
                      ],
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
            code: "not_found",
            detail: "No commands found in source",
            suggestions: [
              {
                description: "Verify the command name and check available commands.",
              },
            ],
          });
        }
        return {
          refs: refs.map((ref) => ({
            ref,
            versionRange: ref.refType === "registry" ? parsed.versionRange : Option.none(),
          })),
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
            commandName: intent.refs[0]?.ref.command.name ?? "command",
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
          name: "Install commands",
          description: Option.some("Install command extensions"),
          jobs: [
            {
              concurrency: 1 as const,
              steps: intent.refs.map((entry) =>
                buildInstallOperation(commandMgr, {
                  ref: entry.ref,
                  versionRange: entry.versionRange,
                }),
              ),
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
