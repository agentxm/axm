/**
 * Pack uninstall command workflow actions.
 *
 * Implements `UninstallExtensionCommandWorkflowActions` for the pack uninstall
 * command. The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { SkillManager, type SkillExtensionRef } from "@agentxm/client-core/unstable/skills";
import {
  PackManager,
  expandPackUninstallTargets,
  type UninstallSettingsContext,
  type PackRef,
} from "@agentxm/client-core/unstable/packs";
import { CommandManager, type CommandExtensionRef } from "@agentxm/client-core/unstable/commands";
import {
  ContextFilesManager,
  type ContextFilesExtensionRef,
} from "@agentxm/client-core/unstable/context-files";
import {
  McpServerManager,
  type McpServerExtensionRef,
} from "@agentxm/client-core/unstable/mcp-servers";
import {
  SubagentManager,
  type SubagentExtensionRef,
} from "@agentxm/client-core/unstable/subagents";
import {
  buildUninstallOperation,
  normalizeHandle,
  parseRegistrySourcePatternParts,
  toLabel,
  type UninstallRetentionPolicy,
} from "@agentxm/client-core/unstable/extensions";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import type { PackExtensionTarget, ExtensionTarget } from "@agentxm/client-core/unstable/workspace";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { expandGlob } from "@agentxm/client-core/unstable/utils";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { LOCKFILE_VERSION } from "@agentxm/client-core/unstable/lockfile";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/** Raw handler args from the CLI parser. */
export interface UninstallPackHandlerArgs {
  readonly name: string;
}

/** Parsed and validated pack uninstall args. */
export interface ParsedPackUninstallArgs {
  readonly packNames: ReadonlyArray<string>;
  readonly isGlob: boolean;
  readonly earlyExit: boolean;
}

/**
 * Intent for the pack uninstall command.
 * Supports multiple packs for glob expansion.
 */
export interface UninstallPackCommandIntent {
  readonly packsToUninstall: ReadonlyArray<PackExtensionTarget>;
}

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class UninstallPackCommandWorkflowActions extends ServiceMap.Service<
  UninstallPackCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallPackHandlerArgs,
    ParsedPackUninstallArgs,
    UninstallPackCommandIntent
  >
>()("axm.sh/root/packs/uninstall/command-actions/UninstallPackCommandWorkflowActions") {}

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

/**
 * Constructs the actions by resolving all services at layer-build time.
 * Each action method closes over the captured services so `R = never`.
 */
export const UninstallPackCommandWorkflowActionsLive = Layer.effect(
  UninstallPackCommandWorkflowActions,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const renderer = yield* CliRenderer;
    const packMgr = yield* PackManager;
    const skillMgr = yield* SkillManager;
    const commandMgr = yield* CommandManager;
    const contextFilesManager = yield* ContextFilesManager;
    const mcpServerMgr = yield* McpServerManager;
    const subagentMgr = yield* SubagentManager;

    const parseArgs = (args: UninstallPackHandlerArgs) =>
      Effect.gen(function* () {
        yield* renderer.info("axm packs uninstall");

        const lockedPacks = yield* ws.getLockedPacks();
        const isGlob = args.name.includes("*");
        const packNames = expandGlob(args.name, Object.keys(lockedPacks));

        // Handle glob matching zero packs
        if (isGlob && packNames.length === 0) {
          yield* renderer.warn(`No packs matched pattern "${args.name}"`);
          yield* renderer.success("Nothing to uninstall.");
          return { packNames: [], isGlob, earlyExit: true };
        }

        // For literal names not in lockfile, still build a target
        const names = packNames.length > 0 ? packNames : [args.name];

        return { packNames: names, isGlob, earlyExit: false };
      });

    const finalizeIntent = (parsed: ParsedPackUninstallArgs) =>
      Effect.gen(function* () {
        if (parsed.earlyExit) {
          return { packsToUninstall: [] };
        }

        const lockedPacks = yield* ws.getLockedPacks();
        const configuredPacks = yield* ws.records.getConfiguredPacks();

        const targets = yield* Effect.forEach(
          parsed.packNames,
          (name): Effect.Effect<PackExtensionTarget, AppError> => {
            const lockEntry = lockedPacks[name];
            if (lockEntry !== undefined) {
              return Effect.succeed({
                type: "pack",
                name,
                owner: lockEntry.owner,
              } satisfies PackExtensionTarget);
            }

            const settingsEntry = configuredPacks[name];
            if (settingsEntry !== undefined) {
              const parts = parseRegistrySourcePatternParts(settingsEntry.source);
              if (parts !== undefined && parts.owner !== undefined) {
                return Effect.succeed({
                  type: "pack",
                  name,
                  owner: normalizeHandle(parts.owner),
                } satisfies PackExtensionTarget);
              }
            }

            return Effect.fail(
              makeAppError({
                code: "not_found",
                detail: `Pack "${name}" is not installed`,
                suggestions: [
                  {
                    description: `Use the fully-qualified \`@owner/packs/${name}\` form, or check \`axm packs list\`.`,
                    cmd: "axm packs list",
                  },
                ],
              }),
            );
          },
        );

        return { packsToUninstall: targets };
      });

    const buildUninstallPlan = (intent: UninstallPackCommandIntent) =>
      Effect.gen(function* () {
        if (intent.packsToUninstall.length === 0) {
          return {
            _tag: "Plan",
            name: "Uninstall pack",
            description: Option.none(),
            jobs: [{ concurrency: 1 as const, steps: [] }],
          } satisfies Plan;
        }

        const retentionPolicy: UninstallRetentionPolicy = {
          isRequiredByInstalledPack: (args) => ws.isExtensionRequiredByInstalledPack(args.target),
          markDependencyRetainedInLockfile: (args) =>
            ws.markDependencyRetainedInLockfile(args.target),
        };

        // Load lockfile and settings for orphan computation
        const lockedPacks = yield* ws.getLockedPacks();
        const lockedSkills = yield* ws.getLockedSkills();
        const lockedCommands = yield* ws.getLockedCommands();
        const lockedMcpServers = yield* ws.getLockedMcpServers();
        const lockedFiles = yield* ws.getLockedFiles();
        const lockfile = {
          lockfileVersion: LOCKFILE_VERSION,
          skills: lockedSkills,
          commands: lockedCommands,
          mcpServers: lockedMcpServers,
          files: lockedFiles,
          packs: lockedPacks,
        };

        // Build settings context for orphan check (just need the keys)
        const configuredSkills = yield* ws.records.getConfiguredSkills();
        const configuredCommands = yield* ws.records.getConfiguredCommands();
        const configuredMcpServers = yield* ws.records.getConfiguredMcpServers();
        const configuredSubagents = yield* ws.records.getConfiguredSubagents();
        const configuredFiles = yield* ws.getConfiguredFileEntries();

        const settings: UninstallSettingsContext = {
          skills: Object.fromEntries(Object.keys(configuredSkills).map((k) => [k, k])),
          commands: Object.fromEntries(Object.keys(configuredCommands).map((k) => [k, k])),
          mcpServers: Object.fromEntries(Object.keys(configuredMcpServers).map((k) => [k, k])),
          subagents: Object.fromEntries(Object.keys(configuredSubagents).map((k) => [k, k])),
          files: Object.fromEntries(Object.keys(configuredFiles).map((k) => [k, k])),
        };

        // Expand each pack and collect all targets, deduplicating by type+name
        const allTargets = new Map<string, ExtensionTarget>();

        for (const pack of intent.packsToUninstall) {
          const targets = yield* expandPackUninstallTargets({
            pack,
            supportedDependencyTypes: ["skill", "command", "mcp-server", "subagent", "file"],
            lockfile,
            settings,
          });

          for (const target of targets) {
            const key = `${target.type}:${target.name}`;
            if (!allTargets.has(key)) {
              allTargets.set(key, target);
            }
          }
        }

        // Order: pack targets first, then dependency targets
        const packTargets = [...allTargets.values()].filter((t) => t.type === "pack");
        const depTargets = [...allTargets.values()].filter((t) => t.type !== "pack");
        const orderedTargets = [...packTargets, ...depTargets];

        const steps = orderedTargets.map((target): PlannedJobStep => {
          if (target.type === "pack") {
            return buildUninstallOperation<PackRef>(packMgr, retentionPolicy, {
              target,
            });
          }

          if (target.type === "skill") {
            return buildUninstallOperation<SkillExtensionRef>(skillMgr, retentionPolicy, {
              target,
            });
          }

          if (target.type === "command") {
            return buildUninstallOperation<CommandExtensionRef>(commandMgr, retentionPolicy, {
              target,
            });
          }

          if (target.type === "mcp-server") {
            return buildUninstallOperation<McpServerExtensionRef>(mcpServerMgr, retentionPolicy, {
              target,
            });
          }

          if (target.type === "subagent") {
            return buildUninstallOperation<SubagentExtensionRef>(subagentMgr, retentionPolicy, {
              target,
            });
          }

          if (target.type === "file") {
            return buildUninstallOperation<ContextFilesExtensionRef>(
              contextFilesManager,
              retentionPolicy,
              {
                target,
              },
            );
          }

          return {
            label: toLabel(target),
            readiness: "error",
            errorMessage: "Unsupported dependency type",
          };
        });

        return {
          _tag: "Plan",
          name: intent.packsToUninstall.length > 1 ? "Uninstall pack(s)" : "Uninstall pack",
          description: Option.none(),
          jobs: [{ concurrency: 1 as const, steps }],
        } satisfies Plan;
      });

    return {
      parseArgs,
      finalizeIntent,
      buildUninstallPlan,
    };
  }),
);
