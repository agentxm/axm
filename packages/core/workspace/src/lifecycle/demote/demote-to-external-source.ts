/**
 * Returning a workspace-authored package to an external source.
 *
 * Demotion is the one transition that deliberately gives up workspace source
 * authority: the authored package stops being the thing the workspace edits
 * and becomes a package the workspace acquires again from a Registry, Git, or
 * local source. Because that replaces content a person wrote, it is a
 * confirmable risk rather than an ordinary install, the replacement is refused
 * unless the target really is workspace-sourced and the replacement source
 * really is external, and an entry that was disabled stays disabled once the
 * external package is in place.
 *
 * `prepare` settles all of that and writes nothing. `previewOrApply` resolves
 * the same candidate, so the preview a person reads and the apply that follows
 * describe one decision.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import { WorkspaceLocation } from "../../desired-state/index.js";

import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import {
  SkillManager,
  SubagentManager,
  RuleManager,
  HookManager,
  KnowledgeManager,
  McpServerManager,
  PackManager,
} from "../../materialization/index.js";
import { buildInstallOperation } from "../../reconciliation/index.js";
import {
  formatFqn,
  parseFqn,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import {
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredPack,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
} from "../../resolution/index.js";
import {
  operationPresentation,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type ExecutionCandidate,
  type Plan,
  type PlanExecution,
  type PlannedJobStep,
} from "../../transitions/planning/index.js";
import {
  SettingsReader,
  type SettingsReaderService,
  SettingsWriter,
  type SettingsWriterService,
  type WorkspaceSettingsReadFailure,
} from "../../desired-state/index.js";

import { ExtensionLifecycleFailed } from "../errors.js";
import { lifecycleStepFailure } from "../step-failure.js";
import type { InstallStepRequirements } from "../install/vocabulary.js";

// -----------------------------------------------------------------------------
// Request and candidate
// -----------------------------------------------------------------------------

/** What a person named: the authored package, and the source that replaces it. */
export interface DemoteRequest {
  /** Owner-qualified identity of the workspace-authored package. */
  readonly fqn: string;
  /** The Registry, Git, or local source the package is acquired from next. */
  readonly source: string;
}

/** The risk a demotion declares, which advance approval may satisfy. */
export const DEMOTE_RISK_CONDITION_ID = "replace-workspace-authority";

/** Everything a demotion step may require when it runs. */
export type DemoteRequirements = InstallStepRequirements;

/**
 * A settled demotion: the replacement is resolved, the refusals are past, and
 * nothing is written. The identity fields answer what the application renders
 * around the frozen candidate.
 */
export interface DemoteCandidate {
  readonly type: ExtensionType;
  readonly name: string;
  /** Owner-qualified identity of the package being demoted. */
  readonly fqn: string;
  /** Workspace-relative authored directory the apply removes. */
  readonly authoredPath: string;
  readonly execution: ExecutionCandidate<DemoteRequirements>;
}

/**
 * Every failure settling a demotion can surface before anything is written:
 * the feature's own refusals, the identity grammar, and whatever resolving
 * the replacement against its source surfaced.
 */
export type DemoteFailure = Effect.Error<ReturnType<typeof settleDemotion>>;

/** Everything settling a demotion reads before it freezes a candidate. */
export type PrepareDemoteRequirements = Effect.Services<ReturnType<typeof settleDemotion>>;

// -----------------------------------------------------------------------------
// Configured entry facts
// -----------------------------------------------------------------------------

/** The configured declaration a demotion replaces, as settings recorded it. */
const configuredEntry = (
  settings: SettingsReaderService,
  type: ExtensionType,
  name: string,
): Effect.Effect<unknown, WorkspaceSettingsReadFailure> => {
  switch (type) {
    case "skill":
      return settings.entries("skill").pipe(Effect.map((entries) => entries[name]));
    case "mcp-server":
      return settings.entries("mcp-server").pipe(Effect.map((entries) => entries[name]));
    case "subagent":
      return settings.entries("subagent").pipe(Effect.map((entries) => entries[name]));
    case "rule":
      return settings.entries("rule").pipe(Effect.map((entries) => entries[name]));
    case "hook":
      return settings.entries("hook").pipe(Effect.map((entries) => entries[name]));
    case "knowledge":
      return settings.entries("knowledge").pipe(Effect.map((entries) => entries[name]));
    case "pack":
      return settings.entries("pack").pipe(Effect.map((entries) => entries[name]));
  }
};

const entrySource = (entry: unknown): string | undefined => {
  if (typeof entry === "string") return entry;
  if (typeof entry !== "object" || entry === null || !("source" in entry)) return undefined;
  return typeof entry.source === "string" ? entry.source : undefined;
};

const entryDisabled = (entry: unknown): boolean =>
  typeof entry === "object" && entry !== null && "enabled" in entry && entry.enabled === false;

/**
 * Re-disable the replaced entry. The install writes an enabled declaration
 * because that is what installing means; a package the workspace had turned
 * off must not come back on because its source changed.
 */
type RestoreDisabledStateFailure = Effect.Error<ReturnType<SettingsWriterService["updateEntry"]>>;

const restoreDisabledState = (
  settings: SettingsWriterService,
  type: ExtensionType,
  name: string,
): Effect.Effect<void, RestoreDisabledStateFailure> => {
  const disable = <T extends { readonly enabled: boolean }>(entry: T): T => ({
    ...entry,
    enabled: false,
  });
  switch (type) {
    case "skill":
      return settings.updateEntry("skill", name, disable);
    case "mcp-server":
      return settings.updateEntry("mcp-server", name, disable);
    case "subagent":
      return settings.updateEntry("subagent", name, disable);
    case "rule":
      return settings.updateEntry("rule", name, disable);
    case "hook":
      return settings.updateEntry("hook", name, disable);
    case "knowledge":
      return settings.updateEntry("knowledge", name, disable);
    // A Pack declaration carries no activation of its own; its members do.
    case "pack":
      return Effect.void;
  }
};

// -----------------------------------------------------------------------------
// The replacement step
// -----------------------------------------------------------------------------

/**
 * Resolve the replacement package from its new source and compose the install
 * that replaces the authored content. `sourceReplacements` is the one
 * place source authority is deliberately overridden, and it is named here so
 * no other route can reach it by accident.
 */
const replacementStep = Effect.fn("Demote.replacementStep")(function* (
  type: ExtensionType,
  name: string,
  source: string,
) {
  const evaluation = yield* makeConfiguredReleaseAgeEvaluation();
  // The one place source authority is deliberately overridden.
  const common = {
    toStepFailure: lifecycleStepFailure,
    sourceReplacements: [{ type, name }],
  } as const;

  switch (type) {
    case "skill":
      return yield* Effect.gen(function* () {
        const resolved = yield* resolveConfiguredSkill(name, source, evaluation);
        return buildInstallOperation(yield* SkillManager, {
          ...common,
          ...resolved,
          declaration: { name, versionRange: resolved.versionRange },
        });
      });
    case "mcp-server":
      return yield* Effect.gen(function* () {
        const resolved = yield* resolveConfiguredMcpServer(name, source, evaluation);
        return buildInstallOperation(yield* McpServerManager, {
          ...common,
          ...resolved,
          declaration: { name, versionRange: resolved.versionRange },
        });
      });
    case "subagent":
      return yield* Effect.gen(function* () {
        const resolved = yield* resolveConfiguredSubagent(name, source, evaluation);
        return buildInstallOperation(yield* SubagentManager, {
          ...common,
          ...resolved,
          declaration: { name, versionRange: resolved.versionRange },
        });
      });
    case "rule":
      return yield* Effect.gen(function* () {
        const resolved = yield* resolveConfiguredRule(name, source, evaluation);
        return buildInstallOperation(yield* RuleManager, {
          ...common,
          ...resolved,
          declaration: { name, versionRange: resolved.versionRange },
        });
      });
    case "hook":
      return yield* Effect.gen(function* () {
        const resolved = yield* resolveConfiguredHook(name, source, evaluation);
        return buildInstallOperation(yield* HookManager, {
          ...common,
          ...resolved,
          declaration: { name, versionRange: resolved.versionRange },
        });
      });
    case "knowledge":
      return yield* Effect.gen(function* () {
        const resolved = yield* resolveConfiguredKnowledge(name, source, evaluation);
        return buildInstallOperation(yield* KnowledgeManager, {
          ...common,
          ...resolved,
          declaration: { name, versionRange: resolved.versionRange },
        });
      });
    case "pack":
      return yield* Effect.gen(function* () {
        const resolved = yield* resolveConfiguredPack(name, source, evaluation);
        return buildInstallOperation(yield* PackManager, {
          ...common,
          ...resolved,
          declaration: { name, versionRange: resolved.versionRange },
        });
      });
  }
});

// -----------------------------------------------------------------------------
// prepare
// -----------------------------------------------------------------------------

/**
 * Settle a demotion: parse the identity, refuse a replacement that is not
 * external or a target that is not workspace-authored, resolve the
 * replacement package, and freeze the execution candidate.
 */
const settleDemotion = Effect.fn("Demote.prepare")(function* (request: DemoteRequest) {
  const location = yield* WorkspaceLocation;
  const layout = yield* Ref.get(location.layout);
  const settings = yield* SettingsReader;
  const settingsWriter = yield* SettingsWriter;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const parsed = yield* Effect.fromResult(parseFqn(request.fqn));

  if (isWorkspaceSourceLocator(request.source)) {
    return yield* new ExtensionLifecycleFailed({
      category: "usage",
      detail: "Demotion target must be a registry, git, or local source",
    });
  }

  const current = yield* configuredEntry(settings, parsed.type, parsed.name);
  const currentSource = entrySource(current);
  if (currentSource === undefined || !isWorkspaceSourceLocator(currentSource)) {
    return yield* new ExtensionLifecycleFailed({
      category: "conflict",
      detail: `${formatFqn(parsed)} is not workspace-sourced`,
    });
  }

  if (layout.scope !== "project") {
    return yield* new ExtensionLifecycleFailed({
      category: "usage",
      detail: "Demote requires project scope",
    });
  }

  const authoredDir = path.join(layout.authoredRoot(parsed.type), parsed.name);
  const operation = yield* replacementStep(parsed.type, parsed.name, request.source);
  const wasDisabled = entryDisabled(current);

  const step: PlannedJobStep<DemoteRequirements> =
    operation.readiness === "error"
      ? operation
      : {
          readiness: "warn",
          label: `Demote ${formatFqn(parsed)}`,
          warnMessage: "Future updates may replace this package from its new source",
          run: Effect.gen(function* () {
            const result = yield* operation.run;
            if (wasDisabled) {
              yield* restoreDisabledState(settingsWriter, parsed.type, parsed.name).pipe(
                Effect.mapError(lifecycleStepFailure),
              );
            }
            // The authored copy is what demotion gives up. Its absence is not
            // a failure: the acquired package is already authoritative.
            yield* fs
              .remove(authoredDir, { recursive: true })
              .pipe(Effect.catch(() => Effect.void));
            return result;
          }),
        };

  const plan: Plan<DemoteRequirements> = {
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
        id: DEMOTE_RISK_CONDITION_ID,
        detail: "The workspace-authored package will be replaced by an externally sourced package.",
      },
    ],
  };

  return {
    type: parsed.type,
    name: parsed.name,
    fqn: formatFqn(parsed),
    authoredPath: authoredDir,
    execution: yield* prepareExecutionCandidate(plan),
  } satisfies DemoteCandidate;
});

export const prepareDemote: (
  request: DemoteRequest,
) => Effect.Effect<DemoteCandidate, DemoteFailure, PrepareDemoteRequirements> = settleDemotion;

// -----------------------------------------------------------------------------
// previewOrApply
// -----------------------------------------------------------------------------

/** Preview or apply a settled demotion, resolving to one operation outcome. */
export const previewOrApplyDemote = (candidate: DemoteCandidate, execution: PlanExecution) =>
  resolveExecutionCandidate(candidate.execution, execution);

/** The demotion use case: settle a request, then preview or apply it. */
export const DemoteToExternalSource = {
  prepare: prepareDemote,
  previewOrApply: previewOrApplyDemote,
} as const;
