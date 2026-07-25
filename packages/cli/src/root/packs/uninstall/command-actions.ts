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
import { FilesManager, type FilesExtensionRef } from "@agentxm/client-core/unstable/files";
import { HookManager, type HookExtensionRef } from "@agentxm/client-core/unstable/hooks";
import { McpServerManager, type McpServerExtensionRef } from "@agentxm/client-core/unstable/mcps";
import { RuleManager, type RuleExtensionRef } from "@agentxm/client-core/unstable/rules";
import {
  SubagentManager,
  type SubagentExtensionRef,
} from "@agentxm/client-core/unstable/subagents";
import {
  buildUninstallOperation,
  normalizeHandle,
  parseRegistrySourcePatternParts,
  toLabel,
} from "@agentxm/client-core/unstable/extensions";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import type { PackExtensionTarget, ExtensionTarget } from "@agentxm/client-core/unstable/workspace";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { count } from "@agentxm/client-core/unstable/cli-renderer";
import { expandGlob } from "@agentxm/client-core/unstable/utils";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { LOCKFILE_VERSION, type Lockfile } from "@agentxm/client-core/unstable/lockfile";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";

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
    const packMgr = yield* PackManager;
    const skillMgr = yield* SkillManager;
    const commandMgr = yield* CommandManager;
    const contextManager = yield* FilesManager;
    const hookManager = yield* HookManager;
    const mcpServerMgr = yield* McpServerManager;
    const ruleManager = yield* RuleManager;
    const subagentMgr = yield* SubagentManager;

    const parseArgs = (args: UninstallPackHandlerArgs) =>
      Effect.gen(function* () {
        const lockedPacks = yield* ws.getLockedPacks();
        const isGlob = args.name.includes("*");
        const packNames = expandGlob(args.name, Object.keys(lockedPacks));

        // Handle glob matching zero packs
        if (isGlob && packNames.length === 0) {
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
                    description: `Use the fully-qualified \`@owner/packs/${name}\` form, or inspect installed packs.`,
                    cmd: "axm packs list",
                  },
                ],
              }),
            );
          },
        );

        return { packsToUninstall: targets };
      });

    const buildUninstallPlan = (
      intent: UninstallPackCommandIntent,
      flags: { readonly sourceDisposition?: "keep" | "delete" },
    ) =>
      Effect.gen(function* () {
        if (intent.packsToUninstall.length === 0) {
          return {
            _tag: "Plan",
            name: "Uninstall packs",
            description: Option.none(),
            jobs: [{ concurrency: 1 as const, steps: [] }],
          } satisfies Plan;
        }

        const retentionPolicy = makeWorkspaceRetentionPolicy(ws);

        // Load lockfile and settings for orphan computation
        const lockedPacks = yield* ws.getLockedPacks();
        const lockedSkills = yield* ws.getLockedSkills();
        const lockedCommands = yield* ws.getLockedCommands();
        const lockedMcpServers = yield* ws.getLockedMcpServers();
        const lockedFiles = yield* ws.getLockedFiles();
        const lockedHooks = yield* ws.getLockedHooks();
        const lockfile = {
          lockfileVersion: LOCKFILE_VERSION,
          skills: lockedSkills,
          commands: lockedCommands,
          mcpServers: lockedMcpServers,
          files: lockedFiles,
          hooks: lockedHooks,
          packs: lockedPacks,
        } satisfies Lockfile;

        // Build settings context for orphan check (just need the keys)
        const configuredSkills = yield* ws.records.getConfiguredSkills();
        const configuredCommands = yield* ws.records.getConfiguredCommands();
        const configuredMcpServers = yield* ws.records.getConfiguredMcpServers();
        const configuredSubagents = yield* ws.records.getConfiguredSubagents();
        const configuredFiles = yield* ws.getConfiguredFilesEntries();
        const configuredRules = yield* ws.getConfiguredRuleEntries();
        const configuredHooks = yield* ws.getConfiguredHookEntries();

        const settings: UninstallSettingsContext = {
          skills: Object.fromEntries(Object.keys(configuredSkills).map((k) => [k, k])),
          commands: Object.fromEntries(Object.keys(configuredCommands).map((k) => [k, k])),
          mcpServers: Object.fromEntries(Object.keys(configuredMcpServers).map((k) => [k, k])),
          subagents: Object.fromEntries(Object.keys(configuredSubagents).map((k) => [k, k])),
          files: Object.fromEntries(Object.keys(configuredFiles).map((k) => [k, k])),
          rules: Object.fromEntries(Object.keys(configuredRules).map((k) => [k, k])),
          hooks: Object.fromEntries(Object.keys(configuredHooks).map((k) => [k, k])),
        };

        // Expand each pack and collect all targets, deduplicating by type+name
        const allTargets = new Map<string, ExtensionTarget>();

        // Every pack in this batch is being removed, so a dependency shared only
        // among them is not retained by any surviving pack.
        const removingPackNames = new Set(intent.packsToUninstall.map((p) => p.name));

        for (const pack of intent.packsToUninstall) {
          const targets = yield* expandPackUninstallTargets({
            pack,
            supportedDependencyTypes: [
              "skill",
              "command",
              "mcp-server",
              "subagent",
              "files",
              "rule",
              "hook",
            ],
            lockfile,
            settings,
            removingPackNames,
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
              ...(flags.sourceDisposition === undefined
                ? {}
                : { sourceDisposition: flags.sourceDisposition }),
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

          if (target.type === "files") {
            return buildUninstallOperation<FilesExtensionRef>(contextManager, retentionPolicy, {
              target,
            });
          }

          if (target.type === "rule") {
            return buildUninstallOperation<RuleExtensionRef>(ruleManager, retentionPolicy, {
              target,
            });
          }

          if (target.type === "hook") {
            return buildUninstallOperation<HookExtensionRef>(hookManager, retentionPolicy, {
              target,
            });
          }

          return {
            label: toLabel(target),
            readiness: "error",
            errorMessage: "Unsupported dependency type",
          };
        });

        return {
          _tag: "Plan",
          name:
            intent.packsToUninstall.length === 0
              ? "Uninstall packs"
              : intent.packsToUninstall.length === 1
                ? "Uninstall pack"
                : `Uninstall ${count(intent.packsToUninstall.length, "pack")}`,
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
