/**
 * Pack uninstall command workflow actions.
 *
 * Implements `UninstallExtensionCommandWorkflowActions` for the pack uninstall
 * command. The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { PackManager } from "../../../extensions/packs/manager.js";
import { SkillManager } from "../../../extensions/skills/manager.js";
import { CommandManager } from "../../../extensions/commands/manager.js";
import { McpServerManager } from "../../../extensions/mcp-servers/manager.js";
import {
  expandPackUninstallTargets,
  type UninstallSettingsContext,
} from "../../../extensions/packs/expansion.js";
import { buildUninstallOperation } from "../../../workflows/uninstall-operation/workflow.js";
import {
  toLabel,
  type UninstallRetentionPolicy,
  type PackExtensionTarget,
  type ExtensionTarget,
} from "../../../workflows/install-operation/workflow.js";
import { Workspace } from "../../../workspace/index.js";
import { Log } from "../../../clack-effect/index.js";
import { expandGlob } from "../../../skills/index.js";
import type { UninstallExtensionCommandWorkflowActions } from "../../../workflows/uninstall-command/workflow.js";
import type {
  PackExtensionRef,
  SkillExtensionRef,
  CommandExtensionRef,
  McpServerExtensionRef,
} from "../../../sources/types.js";
import type { Plan, PlannedJobStep } from "../../../workspace/plan.js";

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
>()("@axm.sh/cli/UninstallPackCommandWorkflowActions") {}

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
    const ws = yield* Workspace;
    const log = yield* Log;
    const packMgr = yield* PackManager;
    const skillMgr = yield* SkillManager;
    const commandMgr = yield* CommandManager;
    const mcpServerMgr = yield* McpServerManager;

    const parseArgs = (args: UninstallPackHandlerArgs) =>
      Effect.gen(function* () {
        yield* log.info("axm packs uninstall");

        const lockedPacks = yield* ws.getLockedPacks();
        const isGlob = args.name.includes("*");
        const packNames = expandGlob(args.name, Object.keys(lockedPacks));

        // Handle glob matching zero packs
        if (isGlob && packNames.length === 0) {
          yield* log.warn(`No packs matched pattern "${args.name}"`);
          yield* log.success("Nothing to uninstall.");
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

        const targets = parsed.packNames.map((name): PackExtensionTarget => {
          const lockEntry = lockedPacks[name];
          return {
            type: "pack",
            name,
            namespace: lockEntry?.namespace ?? "",
          };
        });

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
        const lockfile = {
          lockfileVersion: 1 as const,
          skills: lockedSkills,
          commands: lockedCommands,
          mcpServers: lockedMcpServers,
          packs: lockedPacks,
        };

        // Build settings context for orphan check (just need the keys)
        const configuredSkills = yield* ws.getConfiguredSkills();
        const configuredCommands = yield* ws.getConfiguredCommands();
        const configuredMcpServers = yield* ws.getConfiguredMcpServers();

        const settings: UninstallSettingsContext = {
          skills: Object.fromEntries(Object.keys(configuredSkills).map((k) => [k, k])),
          commands: Object.fromEntries(Object.keys(configuredCommands).map((k) => [k, k])),
          mcpServers: Object.fromEntries(Object.keys(configuredMcpServers).map((k) => [k, k])),
        };

        // Expand each pack and collect all targets, deduplicating by type+name
        const allTargets = new Map<string, ExtensionTarget>();

        for (const pack of intent.packsToUninstall) {
          const targets = yield* expandPackUninstallTargets({
            pack,
            supportedDependencyTypes: ["skill", "command", "mcp-server"],
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
            return buildUninstallOperation<PackExtensionRef>(packMgr, retentionPolicy, {
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

          return {
            label: toLabel(target),
            readiness: "error",
            errorMessage: `Unsupported dependency type: ${(target as ExtensionTarget).type}`,
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
