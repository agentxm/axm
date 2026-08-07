import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { Argument, Command } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  REGISTRY_EXTENSIONS_DIR,
  buildInstallOperation,
  extensionTypeToPlural,
  type ExtensionType,
  fqnInvalidErrorToAppError,
  formatFqn,
  parseFqn,
} from "@agentxm/client-core/unstable/extensions";
import { HookManager } from "@agentxm/client-core/unstable/hooks";
import { KnowledgeManager } from "@agentxm/client-core/unstable/knowledge";
import { McpServerManager } from "@agentxm/client-core/unstable/mcps";
import { PackManager } from "@agentxm/client-core/unstable/packs";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { RuleManager } from "@agentxm/client-core/unstable/rules";
import { SkillManager } from "@agentxm/client-core/unstable/skills";
import { isWorkspaceSourceLocator } from "@agentxm/client-core/unstable/sources";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";
import {
  WorkspaceMutations,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredPack,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
} from "@agentxm/client-core/unstable/workspace";

import { emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

const entrySource = (entry: unknown): string | undefined => {
  if (typeof entry === "string") return entry;
  if (typeof entry !== "object" || entry === null || !("source" in entry)) return undefined;
  return typeof entry.source === "string" ? entry.source : undefined;
};

const entryEnabled = (entry: unknown): boolean | undefined =>
  typeof entry === "object" && entry !== null && "enabled" in entry && entry.enabled === false
    ? false
    : undefined;

const configuredEntry = Effect.fn("Demote.configuredEntry")(function* (
  type: ExtensionType,
  name: string,
) {
  const ws = yield* WorkspaceMutations;
  switch (type) {
    case "skill":
      return (yield* ws.getConfiguredSkillEntries())[name];
    case "mcp-server":
      return (yield* ws.getConfiguredMcpServerEntries())[name];
    case "subagent":
      return (yield* ws.getConfiguredSubagentEntries())[name];
    case "rule":
      return (yield* ws.getConfiguredRuleEntries())[name];
    case "hook":
      return (yield* ws.getConfiguredHookEntries())[name];
    case "knowledge":
      return (yield* ws.getConfiguredKnowledgeEntries())[name];
    case "pack":
      return (yield* ws.getConfiguredPackEntries())[name];
  }
});

const restoreDisabledState = Effect.fn("Demote.restoreDisabledState")(function* (
  type: ExtensionType,
  name: string,
  enabled: boolean | undefined,
) {
  if (enabled !== false) return;
  const ws = yield* WorkspaceMutations;
  const disable = <T extends { readonly enabled: boolean }>(entry: T): T => ({
    ...entry,
    enabled: false,
  });
  switch (type) {
    case "skill":
      yield* ws.updateSkillEntry(name, disable);
      return;
    case "mcp-server":
      yield* ws.updateMcpServerEntry(name, disable);
      return;
    case "subagent":
      yield* ws.updateSubagentEntry(name, disable);
      return;
    case "rule":
      yield* ws.updateRuleEntry(name, disable);
      return;
    case "hook":
      yield* ws.updateHookEntry(name, disable);
      return;
    case "knowledge":
      yield* ws.updateKnowledgeEntry(name, disable);
      return;
    case "pack":
      return;
  }
});

const demotionStep = Effect.fn("Demote.step")(function* (fqnInput: string, source: string) {
  const parsed = yield* Effect.fromResult(
    Result.mapError(parseFqn(fqnInput), fqnInvalidErrorToAppError),
  );
  if (isWorkspaceSourceLocator(source)) {
    return yield* makeAppError({
      code: "usage",
      detail: "Demotion target must be a registry, git, or local source",
    });
  }
  const current = yield* configuredEntry(parsed.type, parsed.name);
  const currentSource = entrySource(current);
  if (currentSource === undefined || !isWorkspaceSourceLocator(currentSource)) {
    return yield* makeAppError({
      code: "conflict",
      detail: `${formatFqn(parsed)} is not workspace-sourced`,
    });
  }

  const operation = yield* Effect.gen(function* () {
    switch (parsed.type) {
      case "skill": {
        const resolved = yield* resolveConfiguredSkill(parsed.name, source);
        return buildInstallOperation(yield* SkillManager, {
          ...resolved,
          allowWorkspaceReplacement: true,
        });
      }
      case "mcp-server": {
        const resolved = yield* resolveConfiguredMcpServer(parsed.name, source);
        return buildInstallOperation(yield* McpServerManager, {
          ...resolved,
          allowWorkspaceReplacement: true,
        });
      }
      case "subagent": {
        const resolved = yield* resolveConfiguredSubagent(parsed.name, source);
        return buildInstallOperation(yield* SubagentManager, {
          ...resolved,
          allowWorkspaceReplacement: true,
        });
      }
      case "rule": {
        const resolved = yield* resolveConfiguredRule(parsed.name, source);
        return buildInstallOperation(yield* RuleManager, {
          ...resolved,
          allowWorkspaceReplacement: true,
        });
      }
      case "hook": {
        const resolved = yield* resolveConfiguredHook(parsed.name, source);
        return buildInstallOperation(yield* HookManager, {
          ...resolved,
          allowWorkspaceReplacement: true,
        });
      }
      case "knowledge": {
        const resolved = yield* resolveConfiguredKnowledge(parsed.name, source);
        return buildInstallOperation(yield* KnowledgeManager, {
          ...resolved,
          allowWorkspaceReplacement: true,
        });
      }
      case "pack": {
        const resolved = yield* resolveConfiguredPack(parsed.name, source);
        return buildInstallOperation(yield* PackManager, {
          ...resolved,
          allowWorkspaceReplacement: true,
        });
      }
    }
  });
  if (operation.readiness !== "ready") return operation;

  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const canonicalDir = path.join(
    ws.baseDir,
    REGISTRY_EXTENSIONS_DIR,
    parsed.owner,
    extensionTypeToPlural[parsed.type],
    parsed.name,
  );
  const run = operation.run.pipe(
    Effect.tap(() => restoreDisabledState(parsed.type, parsed.name, entryEnabled(current))),
    Effect.provideService(WorkspaceMutations, ws),
  );
  return {
    readiness: "warn",
    label: `Demote ${formatFqn(parsed)}`,
    warnMessage: "Future updates may replace this package from its new source",
    run: Effect.gen(function* () {
      const result = yield* run;
      if (!source.startsWith("@")) {
        yield* fs.remove(canonicalDir, { recursive: true }).pipe(Effect.catch(() => Effect.void));
      }
      return result;
    }),
  } satisfies PlannedJobStep;
});

export const handleDemote = Effect.fn("Demote.handle")(function* (args: {
  readonly fqn: string;
  readonly source: string;
  readonly yes: boolean;
  readonly preview: boolean;
}) {
  const step = yield* demotionStep(args.fqn, args.source);
  const plan: Plan = {
    _tag: "Plan",
    name: "Demote workspace extension",
    description: Option.some(
      "Remove workspace source protection; future updates may replace the package",
    ),
    jobs: [{ concurrency: 1, steps: [step] }],
  };
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("demote", resolution);
});

const config = {
  fqn: Argument.string("fqn").pipe(
    Argument.withDescription("Workspace extension FQN (@owner/<plural-type>/name)"),
  ),
  source: Argument.string("source").pipe(
    Argument.withDescription("Replacement registry, git, or local source"),
  ),
  yes: yesFlag,
  preview: previewFlag,
} as const;

export const demoteCommand = Command.make("demote", config, (parsed) =>
  handleDemote(parsed).pipe(withWorkspace("project"), withRuntime("demote")),
).pipe(
  withArgvTracking(config),
  Command.withDescription("Explicitly remove project-workspace source authority"),
  Command.withExamples([
    {
      command: "axm demote @acme/skills/code-review @acme/skills/code-review",
      description: "Return a workspace skill to registry management",
    },
  ]),
);
