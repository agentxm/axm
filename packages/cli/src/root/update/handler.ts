import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import {
  credentialFreeLocatorRecoveryValue,
  recoveryPositional,
  recoverySwitch,
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  type PlanExecution,
} from "@agentxm/client-core/unstable/cli-runtime";
import type { PlanResolution } from "@agentxm/client-core/unstable/plan";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  normalizeReleaseAgeRecords,
  parseMinimumReleaseAge,
  type ReleaseAgeEvaluation,
  type ReleaseAgeEvidence,
  type ReleaseAgeOperationEvidence,
  type ReleaseAgeRecord,
} from "@agentxm/client-core/unstable/registry";
import {
  SourceHostProviders,
  resolveSource,
} from "@agentxm/client-core/unstable/source-resolution";
import {
  WorkspaceMutations,
  usableTrustedCanonical,
  validateDesiredPackTrust,
} from "@agentxm/client-core/unstable/workspace";
import {
  decodeVersionRangeSync,
  versionSatisfiesRange,
} from "@agentxm/client-core/unstable/version-constraints";

import { emitPlanResolutionResult, planResolutionToSummary } from "../../json-output.js";
import {
  InstallMcpServerCommandWorkflowActions,
  type InstallMcpServerHandlerArgs,
} from "../mcps/install/command-actions.js";
import {
  InstallHookCommandWorkflowActions,
  type InstallHookHandlerArgs,
} from "../hooks/install/command-actions.js";
import {
  InstallKnowledgeCommandWorkflowActions,
  type InstallKnowledgeHandlerArgs,
} from "../knowledge/install/command-actions.js";
import {
  InstallPackCommandWorkflowActions,
  type InstallPackHandlerArgs,
} from "../packs/install/command-actions.js";
import {
  InstallRuleCommandWorkflowActions,
  type InstallRuleHandlerArgs,
} from "../rules/install/command-actions.js";
import { InstallSkillCommandWorkflowActions } from "../skills/install/command-actions.js";
import { InstallSubagentCommandWorkflowActions } from "../subagents/install/command-actions.js";
import { resolveRootUpdateIntent, type RootUpdateIntent } from "./resolve-root-update-intent.js";
import { handleWorkspaceUpdate } from "./workspace-update-handler.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";

export interface RootUpdateFlags {
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
  readonly ignoreReleaseAge?: boolean;
}

export interface RootUpdateHandlerArgs extends RootUpdateFlags {
  readonly source: Option.Option<string>;
  readonly recoveryCommand?: ReadonlyArray<string>;
}

const runUpdateIntent = (
  intent: RootUpdateIntent,
  execution: PlanExecution,
  releaseAgeEvaluation?: ReleaseAgeEvaluation,
) =>
  Effect.gen(function* () {
    switch (intent.type) {
      case "skill": {
        const actions = yield* InstallSkillCommandWorkflowActions;
        return yield* runInstallCommandWorkflow(
          { source: intent.source, skills: [], all: false },
          actions,
          { execution },
        );
      }
      case "mcp-server": {
        const actions = yield* InstallMcpServerCommandWorkflowActions;
        const mcpArgs: InstallMcpServerHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(mcpArgs, actions, { execution });
      }
      case "rule": {
        const actions = yield* InstallRuleCommandWorkflowActions;
        const ruleArgs: InstallRuleHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(ruleArgs, actions, { execution });
      }
      case "hook": {
        const actions = yield* InstallHookCommandWorkflowActions;
        const hookArgs: InstallHookHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(hookArgs, actions, { execution });
      }
      case "knowledge": {
        const actions = yield* InstallKnowledgeCommandWorkflowActions;
        const knowledgeArgs: InstallKnowledgeHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(knowledgeArgs, actions, { execution });
      }
      case "subagent": {
        const actions = yield* InstallSubagentCommandWorkflowActions;
        return yield* runInstallCommandWorkflow(
          { source: intent.source, subagents: [], all: false },
          actions,
          { execution },
        );
      }
      case "pack": {
        const actions = yield* InstallPackCommandWorkflowActions;
        const packArgs: InstallPackHandlerArgs = {
          source: intent.source,
          unattended: true,
          ...(releaseAgeEvaluation === undefined
            ? {}
            : {
                releaseAgeEvaluation,
                releaseAgeHoldbackBehavior: "preserve-or-block",
              }),
        };
        return yield* runInstallCommandWorkflow(packArgs, actions, { execution });
      }
    }
  });

const releaseAgeRecord = (args: {
  readonly intent: RootUpdateIntent;
  readonly evidence: ReleaseAgeEvidence;
  readonly currentVersion?: string;
  readonly selectedVersion?: string;
}): ReleaseAgeRecord => ({
  reason: "minimum-release-age",
  target: args.intent.target,
  dependencyPath: [args.intent.target],
  ...Option.match(args.intent.versionRange, {
    onNone: () => ({}),
    onSome: (requestedRange) => ({ requestedRange }),
  }),
  ...(args.currentVersion === undefined ? {} : { currentVersion: args.currentVersion }),
  ...(args.selectedVersion === undefined ? {} : { selectedVersion: args.selectedVersion }),
  candidateVersion: args.evidence.version,
  publishedAt: args.evidence.publishedAt,
  eligibleAt: args.evidence.eligibleAt,
  minimumReleaseAgeSeconds: args.evidence.minimumReleaseAgeSeconds,
});

const withReleaseAge = (
  resolution: PlanResolution,
  releaseAge: ReleaseAgeOperationEvidence,
): PlanResolution => ({ ...resolution, releaseAge });

const normalizedPackIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const preservableRegistryVersion = (intent: RootUpdateIntent) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const initialGraph = yield* workspace.getDesiredStateGraph();
    const trust = yield* workspace.getTrustState();
    const graph =
      intent.type === "pack"
        ? yield* validateDesiredPackTrust({
            baseDir: workspace.baseDir,
            graph: initialGraph,
            trust,
          })
        : initialGraph;
    if (!graph.complete) return Option.none<string>();

    const desired = graph.nodes.find(
      (node) =>
        node.type === intent.type &&
        node.name === intent.name &&
        normalizedPackIdentity(node.identity) === intent.target,
    );
    if (desired === undefined) return Option.none<string>();

    const canonical = yield* usableTrustedCanonical({
      workspace,
      type: intent.type,
      name: intent.name,
    });
    if (Option.isNone(canonical)) return Option.none<string>();
    const ref = canonical.value.ref;
    if (ref.refType !== "registry" || ref.owner !== intent.owner || ref.name !== intent.name) {
      return Option.none<string>();
    }
    if (
      Option.isSome(intent.versionRange) &&
      !versionSatisfiesRange(ref.version, decodeVersionRangeSync(intent.versionRange.value))
    ) {
      return Option.none<string>();
    }

    if (intent.type === "pack") {
      const graphNodes = graph.nodes.filter(
        (node) =>
          (node.type === "pack" && node.name === intent.name) ||
          node.origins.some(
            (origin) =>
              origin.type === "pack" && normalizedPackIdentity(origin.pack) === intent.target,
          ),
      );
      const usable = yield* Effect.forEach(graphNodes, (node) =>
        usableTrustedCanonical({ workspace, type: node.type, name: node.name }).pipe(
          Effect.map(Option.isSome),
        ),
      );
      if (usable.some((value) => !value)) return Option.none<string>();
    }

    return Option.some(ref.version);
  });

const heldTargetResolution = (args: {
  readonly intent: RootUpdateIntent;
  readonly evidence: ReleaseAgeEvidence;
  readonly evaluatedAt: string;
}) =>
  Effect.gen(function* () {
    const currentVersion = yield* preservableRegistryVersion(args.intent);
    const record = releaseAgeRecord({
      intent: args.intent,
      evidence: args.evidence,
      ...(Option.isNone(currentVersion)
        ? {}
        : { currentVersion: currentVersion.value, selectedVersion: currentVersion.value }),
    });
    const releaseAge = {
      evaluatedAt: args.evaluatedAt,
      holdbacks: [record],
      bypasses: [],
    } satisfies ReleaseAgeOperationEvidence;
    if (Option.isSome(currentVersion)) {
      return {
        _tag: "ExecutedPlan",
        name: `Update ${args.intent.target}`,
        description: Option.some(
          `Preserve ${args.intent.target} until its selected release is eligible`,
        ),
        jobs: [{ concurrency: 1, steps: [] }],
        releaseAge,
      } satisfies PlanResolution;
    }
    return {
      _tag: "FailedPlan",
      name: `Update ${args.intent.target}`,
      description: Option.some(`Update ${args.intent.target}`),
      jobs: [],
      releaseAge,
      reason: "hard-blocked",
      errorCode: "conflict",
      suggestions: [
        {
          description: `Wait until ${args.evidence.eligibleAt}, request an eligible older version, or retry with --ignore-release-age.`,
        },
      ],
    } satisfies PlanResolution;
  });

const resolveTargetedUpdate = (
  intent: RootUpdateIntent,
  execution: PlanExecution,
  ignoreReleaseAge: boolean,
) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const minimumReleaseAgeText = yield* workspace.getMinimumReleaseAge();
    const minimumReleaseAge = parseMinimumReleaseAge(minimumReleaseAgeText);
    if (Option.isNone(minimumReleaseAge)) {
      return yield* makeAppError({
        code: "validation",
        detail: `Invalid minimumReleaseAge "${minimumReleaseAgeText}"`,
        recover: "Use a duration such as 24h, 1440m, or 0s.",
      });
    }
    const evaluatedAt = yield* DateTime.now;
    const source = yield* resolveSource(intent.source);
    if (source.type !== "registry") {
      return yield* makeAppError({ code: "usage", detail: "Root update requires a Registry FQN" });
    }
    const providers = yield* SourceHostProviders;
    const releaseAgeEvaluation = {
      minimumReleaseAge: minimumReleaseAge.value,
      evaluatedAt,
      mode: ignoreReleaseAge ? "ignore" : "enforce",
    } satisfies ReleaseAgeEvaluation;
    const selected = yield* providers.resolveNamedRegistry(source, {
      name: intent.name,
      type: intent.type,
      owner: intent.owner,
      versionRange: intent.versionRange,
      releaseAgeEvaluation,
    });
    if (selected.kind === "not_found") {
      return yield* makeAppError({
        code: "not_found",
        detail: `Registry extension "${selected.target}" was not found`,
      });
    }
    if (selected.kind === "version_unsatisfied") {
      return yield* makeAppError({
        code: "conflict",
        title: "No compatible version",
        detail: `No visible version of "${selected.target}" satisfies ${selected.requestedRange}`,
      });
    }
    const evaluatedAtText = DateTime.formatIso(evaluatedAt);
    if (selected.kind === "policy_held") {
      return yield* heldTargetResolution({
        intent,
        evidence: selected.candidate,
        evaluatedAt: evaluatedAtText,
      });
    }

    const exactIntent = { ...intent, source: `${intent.target}@${selected.ref.version}` };
    const resolution = yield* runUpdateIntent(exactIntent, execution, releaseAgeEvaluation);
    const holdbacks =
      selected.newerHeld === undefined
        ? []
        : [
            releaseAgeRecord({
              intent,
              evidence: selected.newerHeld,
              selectedVersion: selected.ref.version,
            }),
          ];
    const bypasses =
      selected.bypassed === undefined
        ? []
        : [
            releaseAgeRecord({
              intent,
              evidence: selected.bypassed,
              selectedVersion: selected.ref.version,
            }),
          ];
    return withReleaseAge(resolution, {
      evaluatedAt: evaluatedAtText,
      holdbacks: normalizeReleaseAgeRecords([
        ...holdbacks,
        ...(resolution.releaseAge?.holdbacks ?? []),
      ]),
      bypasses: normalizeReleaseAgeRecords([
        ...bypasses,
        ...(resolution.releaseAge?.bypasses ?? []),
      ]),
    });
  });

export const handleUpdate = (args: RootUpdateHandlerArgs) =>
  Option.match(args.source, {
    onNone: () =>
      args.ignoreReleaseAge === true
        ? makeAppError({
            code: "usage",
            detail: "--ignore-release-age requires one targeted Registry FQN",
            recover: "Retry with one fully qualified Registry extension target.",
          })
        : handleWorkspaceUpdate({
            command: "update",
            type: Option.none(),
            planName: "Update configured extensions",
            planDescription: Option.some("Update configured workspace extensions"),
            flags: args,
          }),
    onSome: (source) =>
      Effect.gen(function* () {
        const execution = yield* makePlanExecution(
          args,
          makeConfirmationRecovery(args.recoveryCommand ?? ["update"], [
            recoverySwitch("--refresh", args.force),
            recoverySwitch("--ignore-release-age", args.ignoreReleaseAge === true),
            recoveryPositional(credentialFreeLocatorRecoveryValue(source)),
          ]),
        );
        const intent = yield* resolveRootUpdateIntent(source);
        const resolution = yield* resolveTargetedUpdate(
          intent,
          execution,
          args.ignoreReleaseAge === true,
        );
        const outputResolution: PlanResolution = resolution;
        yield* setCommandSemanticProperties(
          summarizeCommandOutcome(
            planResolutionToSummary(outputResolution, {
              subjectType: intent.type,
              sourceKind: "registry",
            }),
          ),
        );
        yield* emitPlanResolutionResult("update", outputResolution);
      }),
  });
