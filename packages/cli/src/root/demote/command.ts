import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { Argument, Command } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import { previewFlag, yesFlag } from "@agentxm/extension-management/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import {
  previewOrApplyPlan,
  credentialFreeLocatorRecoveryValue,
  publicRecoveryValue,
  recoveryPositional,
} from "@agentxm/workspace-operations";
import { buildInstallOperation } from "@agentxm/extension-management/unstable/extensions";
import {
  type ExtensionType,
  formatFqn,
  parseFqn,
} from "@agentxm/extension-model/unstable/extensions";
import {
  appErrorToStepFailure,
  fqnInvalidErrorToAppError,
  toAppError,
} from "@agentxm/extension-management/unstable/app-error/conversions";
import type { Plan, PlannedJobStep } from "@agentxm/workspace-operations";
import { operationPresentation } from "@agentxm/workspace-operations";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import {
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredPack,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
} from "@agentxm/extension-management/unstable/extension-lifecycle";

import { emitOperationResolution } from "../../operation-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import {
  HookManager,
  KnowledgeManager,
  McpServerManager,
  PackManager,
  RuleManager,
  SkillManager,
  SubagentManager,
} from "@agentxm/extension-workspace";

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
      return (yield* ws.getConfiguredSkillEntries().pipe(Effect.mapError(toAppError)))[name];
    case "mcp-server":
      return (yield* ws.getConfiguredMcpServerEntries().pipe(Effect.mapError(toAppError)))[name];
    case "subagent":
      return (yield* ws.getConfiguredSubagentEntries().pipe(Effect.mapError(toAppError)))[name];
    case "rule":
      return (yield* ws.getConfiguredRuleEntries().pipe(Effect.mapError(toAppError)))[name];
    case "hook":
      return (yield* ws.getConfiguredHookEntries().pipe(Effect.mapError(toAppError)))[name];
    case "knowledge":
      return (yield* ws.getConfiguredKnowledgeEntries().pipe(Effect.mapError(toAppError)))[name];
    case "pack":
      return (yield* ws.getConfiguredPackEntries().pipe(Effect.mapError(toAppError)))[name];
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
      yield* ws.updateSkillEntry(name, disable).pipe(Effect.mapError(toAppError));
      return;
    case "mcp-server":
      yield* ws.updateMcpServerEntry(name, disable).pipe(Effect.mapError(toAppError));
      return;
    case "subagent":
      yield* ws.updateSubagentEntry(name, disable).pipe(Effect.mapError(toAppError));
      return;
    case "rule":
      yield* ws.updateRuleEntry(name, disable).pipe(Effect.mapError(toAppError));
      return;
    case "hook":
      yield* ws.updateHookEntry(name, disable).pipe(Effect.mapError(toAppError));
      return;
    case "knowledge":
      yield* ws.updateKnowledgeEntry(name, disable).pipe(Effect.mapError(toAppError));
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
    const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation("enforce");
    switch (parsed.type) {
      case "skill": {
        const resolved = yield* resolveConfiguredSkill(parsed.name, source, releaseAgeEvaluation);
        return buildInstallOperation(yield* SkillManager, {
          ...resolved,
          allowWorkspaceReplacement: true,
        });
      }
      case "mcp-server": {
        const resolved = yield* resolveConfiguredMcpServer(
          parsed.name,
          source,
          releaseAgeEvaluation,
        );
        return buildInstallOperation(yield* McpServerManager, {
          ...resolved,
          allowWorkspaceReplacement: true,
        });
      }
      case "subagent": {
        const resolved = yield* resolveConfiguredSubagent(
          parsed.name,
          source,
          releaseAgeEvaluation,
        );
        return buildInstallOperation(yield* SubagentManager, {
          ...resolved,
          allowWorkspaceReplacement: true,
        });
      }
      case "rule": {
        const resolved = yield* resolveConfiguredRule(parsed.name, source, releaseAgeEvaluation);
        return buildInstallOperation(yield* RuleManager, {
          ...resolved,
          allowWorkspaceReplacement: true,
        });
      }
      case "hook": {
        const resolved = yield* resolveConfiguredHook(parsed.name, source, releaseAgeEvaluation);
        return buildInstallOperation(yield* HookManager, {
          ...resolved,
          allowWorkspaceReplacement: true,
        });
      }
      case "knowledge": {
        const resolved = yield* resolveConfiguredKnowledge(
          parsed.name,
          source,
          releaseAgeEvaluation,
        );
        return buildInstallOperation(yield* KnowledgeManager, {
          ...resolved,
          allowWorkspaceReplacement: true,
        });
      }
      case "pack": {
        const resolved = yield* resolveConfiguredPack(parsed.name, source, releaseAgeEvaluation);
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
  if (ws.layout.scope !== "project") {
    return yield* makeAppError({ code: "usage", detail: "Demote requires project scope" });
  }
  const authoredDir = path.join(ws.layout.authoredRoot(parsed.type), parsed.name);
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
      yield* fs.remove(authoredDir, { recursive: true }).pipe(Effect.catch(() => Effect.void));
      return result;
    }).pipe(
      Effect.mapError((error) =>
        error._tag === "AppError" ? appErrorToStepFailure(error) : error,
      ),
    ),
  } satisfies PlannedJobStep;
});

export const handleDemote = (args: {
  readonly fqn: string;
  readonly source: string;
  readonly yes: boolean;
  readonly preview: boolean;
}) =>
  withOperationLifecycle(
    {
      command: "demote",
      mode: args.preview ? "preview" : "apply",
      planName: "Demote workspace extension",
    },
    handleDemoteBody(args),
  );

const handleDemoteBody = Effect.fn("Demote.handle")(function* (args: {
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
    presentation: operationPresentation({
      imperative: "demote",
      past: "Demoted",
      gerund: "Demoting",
    }),
    jobs: [{ concurrency: 1, steps: [step] }],
    riskConditions: [
      {
        level: "confirmable",
        id: "replace-workspace-authority",
        detail: "The workspace-authored package will be replaced by an externally sourced package.",
      },
    ],
  };
  const execution = yield* makePlanExecution(
    args,
    makeConfirmationRecovery(
      ["demote"],
      [
        recoveryPositional(publicRecoveryValue(args.fqn)),
        recoveryPositional(credentialFreeLocatorRecoveryValue(args.source)),
      ],
    ),
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  yield* emitOperationResolution("demote", resolution);
});

const config = {
  fqn: Argument.string("extension").pipe(
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
