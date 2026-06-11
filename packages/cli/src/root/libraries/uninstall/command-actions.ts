import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import {
  buildUninstallOperation,
  parseExtensionFqnParts,
  toLabel,
} from "@agentxm/client-core/unstable/extensions";
import { CommandManager, type CommandExtensionRef } from "@agentxm/client-core/unstable/commands";
import { FilesManager, type FilesExtensionRef } from "@agentxm/client-core/unstable/files";
import { HookManager, type HookExtensionRef } from "@agentxm/client-core/unstable/hooks";
import { McpServerManager, type McpServerExtensionRef } from "@agentxm/client-core/unstable/mcps";
import { RuleManager, type RuleExtensionRef } from "@agentxm/client-core/unstable/rules";
import { SkillManager, type SkillExtensionRef } from "@agentxm/client-core/unstable/skills";
import {
  SubagentManager,
  type SubagentExtensionRef,
} from "@agentxm/client-core/unstable/subagents";
import { WorkspaceMutations, type ExtensionTarget } from "@agentxm/client-core/unstable/workspace";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import type {
  LibrariesLockMap,
  ResolvedExtensionMap,
} from "@agentxm/client-core/unstable/lockfile";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";

export interface UninstallLibraryHandlerArgs {
  readonly name: string;
}

export interface ParsedLibraryUninstallArgs {
  readonly name: string;
}

export interface UninstallLibraryCommandIntent {
  readonly name: string;
}

const targetKey = (target: ExtensionTarget): string => `${target.type}:${target.name}`;

const mapTargets = (
  type: Exclude<ExtensionTarget["type"], "pack">,
  map: ResolvedExtensionMap,
): ReadonlyArray<ExtensionTarget> =>
  Object.keys(map).flatMap((fqn) => {
    const parsed = parseExtensionFqnParts(fqn);
    if (parsed === undefined) return [];
    return [{ type, name: parsed.name }];
  });

const libraryTargets = (entry: {
  readonly resolvedSkills: ResolvedExtensionMap;
  readonly resolvedCommands: ResolvedExtensionMap;
  readonly resolvedMcpServers: ResolvedExtensionMap;
  readonly resolvedSubagents: ResolvedExtensionMap;
  readonly resolvedFiles: ResolvedExtensionMap;
  readonly resolvedRules: ResolvedExtensionMap;
  readonly resolvedHooks: ResolvedExtensionMap;
}): ReadonlyArray<ExtensionTarget> => [
  ...mapTargets("skill", entry.resolvedSkills),
  ...mapTargets("command", entry.resolvedCommands),
  ...mapTargets("mcp-server", entry.resolvedMcpServers),
  ...mapTargets("subagent", entry.resolvedSubagents),
  ...mapTargets("files", entry.resolvedFiles),
  ...mapTargets("rule", entry.resolvedRules),
  ...mapTargets("hook", entry.resolvedHooks),
];

const uniqueTargets = (targets: ReadonlyArray<ExtensionTarget>): ReadonlyArray<ExtensionTarget> => {
  const seen = new Map<string, ExtensionTarget>();
  for (const target of targets) {
    const key = targetKey(target);
    if (!seen.has(key)) {
      seen.set(key, target);
    }
  }
  return [...seen.values()];
};

const configuredTargetKeys = (args: {
  readonly skills: Readonly<Record<string, unknown>>;
  readonly commands: Readonly<Record<string, unknown>>;
  readonly mcpServers: Readonly<Record<string, unknown>>;
  readonly subagents: Readonly<Record<string, unknown>>;
  readonly files: Readonly<Record<string, unknown>>;
  readonly rules: Readonly<Record<string, unknown>>;
  readonly hooks: Readonly<Record<string, unknown>>;
}): ReadonlySet<string> =>
  new Set([
    ...Object.keys(args.skills).map((name) => `skill:${name}`),
    ...Object.keys(args.commands).map((name) => `command:${name}`),
    ...Object.keys(args.mcpServers).map((name) => `mcp-server:${name}`),
    ...Object.keys(args.subagents).map((name) => `subagent:${name}`),
    ...Object.keys(args.files).map((name) => `files:${name}`),
    ...Object.keys(args.rules).map((name) => `rule:${name}`),
    ...Object.keys(args.hooks).map((name) => `hook:${name}`),
  ]);

const otherLibraryTargetKeys = (
  currentLibraryName: string,
  libraries: LibrariesLockMap,
): ReadonlySet<string> =>
  new Set(
    Object.entries(libraries)
      .filter(([name]) => name !== currentLibraryName)
      .flatMap(([, entry]) => libraryTargets(entry).map(targetKey)),
  );

const buildRemoveLibraryStep = (args: {
  readonly name: string;
  readonly remove: Effect.Effect<void, AppError, never>;
}): PlannedJobStep => ({
  key: `library:${args.name}`,
  label: args.name,
  readiness: "ready",
  run: args.remove.pipe(
    Effect.map(() => ({
      result: "success" as const,
      message: `Removed Library subscription ${args.name}`,
    })),
  ),
});

export class UninstallLibraryCommandWorkflowActions extends ServiceMap.Service<
  UninstallLibraryCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallLibraryHandlerArgs,
    ParsedLibraryUninstallArgs,
    UninstallLibraryCommandIntent
  >
>()("axm.sh/root/libraries/uninstall/command-actions/UninstallLibraryCommandWorkflowActions") {}

export const UninstallLibraryCommandWorkflowActionsLive = Layer.effect(
  UninstallLibraryCommandWorkflowActions,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const skillMgr = yield* SkillManager;
    const commandMgr = yield* CommandManager;
    const filesManager = yield* FilesManager;
    const ruleManager = yield* RuleManager;
    const hookManager = yield* HookManager;
    const mcpServerMgr = yield* McpServerManager;
    const subagentMgr = yield* SubagentManager;

    const parseArgs = (args: UninstallLibraryHandlerArgs) =>
      Effect.succeed({ name: args.name } satisfies ParsedLibraryUninstallArgs);

    const finalizeIntent = (parsed: ParsedLibraryUninstallArgs) =>
      Effect.gen(function* () {
        const locked = yield* ws.getLockedLibrary(parsed.name);
        const configured = yield* ws.getConfiguredLibraryEntries();
        if (Option.isNone(locked) && configured[parsed.name] === undefined) {
          return yield* makeAppError({
            code: "not_found",
            detail: `Library "${parsed.name}" is not installed`,
            suggestions: [
              {
                description: "Inspect configured Library subscriptions.",
                cmd: "axm install",
              },
            ],
          });
        }

        return { name: parsed.name } satisfies UninstallLibraryCommandIntent;
      });

    const buildUninstallPlan = (intent: UninstallLibraryCommandIntent) =>
      Effect.gen(function* () {
        const locked = yield* ws.getLockedLibrary(intent.name);
        const libraries = yield* ws.getLockedLibraries();

        const directConfigured = configuredTargetKeys({
          skills: yield* ws.records.getConfiguredSkills(),
          commands: yield* ws.records.getConfiguredCommands(),
          mcpServers: yield* ws.records.getConfiguredMcpServers(),
          subagents: yield* ws.records.getConfiguredSubagents(),
          files: yield* ws.getConfiguredFilesEntries(),
          rules: yield* ws.getConfiguredRuleEntries(),
          hooks: yield* ws.getConfiguredHookEntries(),
        });
        const otherLibraryMembers = otherLibraryTargetKeys(intent.name, libraries);

        const dependencyTargets = Option.match(locked, {
          onNone: (): ReadonlyArray<ExtensionTarget> => [],
          onSome: (entry) =>
            uniqueTargets(libraryTargets(entry)).filter((target) => {
              const key = targetKey(target);
              return !directConfigured.has(key) && !otherLibraryMembers.has(key);
            }),
        });

        const retentionPolicy = makeWorkspaceRetentionPolicy(ws);

        const removeStep = buildRemoveLibraryStep({
          name: intent.name,
          remove: ws.removeLibrary(intent.name),
        });

        const dependencySteps = dependencyTargets.map((target): PlannedJobStep => {
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
            return buildUninstallOperation<FilesExtensionRef>(filesManager, retentionPolicy, {
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
            key: `unsupported:${toLabel(target)}`,
            label: toLabel(target),
            readiness: "error",
            errorMessage: "Libraries cannot uninstall pack members",
          };
        });

        return {
          _tag: "Plan",
          name: "Uninstall Library",
          description: Option.none(),
          jobs: [{ concurrency: 1 as const, steps: [removeStep, ...dependencySteps] }],
        } satisfies Plan;
      });

    return {
      parseArgs,
      finalizeIntent,
      buildUninstallPlan,
    };
  }),
);
