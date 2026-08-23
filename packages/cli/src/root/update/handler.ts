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
import type { OperationResolution, Plan } from "@agentxm/client-core/unstable/plan";
import {
  makeOperationResolution,
  operationPresentation,
  previewOrApplyPlan,
} from "@agentxm/client-core/unstable/plan";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import {
  normalizeReleaseAgeRecords,
  type ReleaseAgeEvaluation,
  type ReleaseAgeEvidence,
  type ReleaseAgeHoldbackRecord,
  type ReleaseAgeOperationEvidence,
} from "@agentxm/client-core/unstable/registry";
import {
  SourceHostProviders,
  resolveSource,
} from "@agentxm/client-core/unstable/source-resolution";
import {
  WorkspaceMutations,
  acceptedResolutionRef,
  makeConfiguredReleaseAgeEvaluation,
  usableAcceptedCanonical,
} from "@agentxm/client-core/unstable/workspace";
import {
  decodeVersionRangeSync,
  versionSatisfiesRange,
} from "@agentxm/client-core/unstable/version-constraints";
import { toExtensionTypePlural } from "@agentxm/client-core/unstable/extensions";

import { emitOperationResolution, operationResolutionSummary } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
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
import { buildPackMemberInstallStep } from "../packs/member-install-step.js";
import {
  resolveTargetedUpdateContext,
  type TargetedUpdateContext,
  type TargetedUpdatePublicContext,
} from "./targeted-update-context.js";
import { TARGETED_UPDATE_STALE_DETAIL, wrapTargetedUpdatePlan } from "./targeted-update-plan.js";

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
  transformPlan?: (plan: Plan) => Effect.Effect<Plan, AppError, WorkspaceMutations>,
) =>
  Effect.gen(function* () {
    switch (intent.type) {
      case "skill": {
        const actions = yield* InstallSkillCommandWorkflowActions;
        return yield* runInstallCommandWorkflow(
          { source: intent.source, skills: [], all: false },
          actions,
          {
            execution,
            ...(transformPlan === undefined ? {} : { transformPlan }),
            transformIntent: (resolved) => ({
              ...resolved,
              skillsToInstall: resolved.skillsToInstall.map((entry) => ({
                ...entry,
                versionRange: intent.versionRange,
              })),
            }),
          },
        );
      }
      case "mcp-server": {
        const actions = yield* InstallMcpServerCommandWorkflowActions;
        const mcpArgs: InstallMcpServerHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(mcpArgs, actions, {
          execution,
          ...(transformPlan === undefined ? {} : { transformPlan }),
          transformIntent: (resolved) => ({ ...resolved, versionRange: intent.versionRange }),
        });
      }
      case "rule": {
        const actions = yield* InstallRuleCommandWorkflowActions;
        const ruleArgs: InstallRuleHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(ruleArgs, actions, {
          execution,
          ...(transformPlan === undefined ? {} : { transformPlan }),
          transformIntent: (resolved) => ({
            ...resolved,
            refs: resolved.refs.map((entry) => ({
              ...entry,
              versionRange: intent.versionRange,
            })),
          }),
        });
      }
      case "hook": {
        const actions = yield* InstallHookCommandWorkflowActions;
        const hookArgs: InstallHookHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(hookArgs, actions, {
          execution,
          ...(transformPlan === undefined ? {} : { transformPlan }),
          transformIntent: (resolved) => ({
            ...resolved,
            refs: resolved.refs.map((entry) => ({
              ...entry,
              versionRange: intent.versionRange,
            })),
          }),
        });
      }
      case "knowledge": {
        const actions = yield* InstallKnowledgeCommandWorkflowActions;
        const knowledgeArgs: InstallKnowledgeHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(knowledgeArgs, actions, {
          execution,
          ...(transformPlan === undefined ? {} : { transformPlan }),
          transformIntent: (resolved) => ({
            ...resolved,
            refs: resolved.refs.map((entry) => ({
              ...entry,
              versionRange: intent.versionRange,
            })),
          }),
        });
      }
      case "subagent": {
        const actions = yield* InstallSubagentCommandWorkflowActions;
        return yield* runInstallCommandWorkflow(
          { source: intent.source, subagents: [], all: false },
          actions,
          {
            execution,
            ...(transformPlan === undefined ? {} : { transformPlan }),
            transformIntent: (resolved) => ({
              ...resolved,
              subagentsToInstall: resolved.subagentsToInstall.map((entry) => ({
                ...entry,
                versionRange: intent.versionRange,
              })),
            }),
          },
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
        return yield* runInstallCommandWorkflow(packArgs, actions, {
          execution,
          transformIntent: (resolved) => ({ ...resolved, versionRange: intent.versionRange }),
        });
      }
    }
  });

const releaseAgeRecord = (args: {
  readonly intent: RootUpdateIntent;
  readonly evidence: ReleaseAgeEvidence;
  readonly currentVersion?: string;
  readonly selectedVersion?: string;
}): ReleaseAgeHoldbackRecord => ({
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

const updatePresentation = (type: RootUpdateIntent["type"]) =>
  operationPresentation({ imperative: "update", past: "Updated", gerund: "Updating" }, type);

const withReleaseAge = (
  resolution: OperationResolution,
  releaseAge: ReleaseAgeOperationEvidence,
): OperationResolution => ({ ...resolution, releaseAge });

const normalizedPackIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const preservableRegistryVersion = (intent: RootUpdateIntent) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const graph = yield* workspace.getDesiredStateGraph();
    if (!graph.complete) return Option.none<string>();

    const desired = graph.nodes.find(
      (node) =>
        node.type === intent.type &&
        node.name === intent.name &&
        normalizedPackIdentity(node.identity) === intent.target,
    );
    if (desired === undefined) return Option.none<string>();

    const canonical = yield* usableAcceptedCanonical({
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
        usableAcceptedCanonical({ workspace, type: node.type, name: node.name }).pipe(
          Effect.map(Option.isSome),
        ),
      );
      if (usable.some((value) => !value)) return Option.none<string>();
    }

    return Option.some(ref.version);
  });

const acceptedRegistryFloor = (intent: RootUpdateIntent) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const accepted = yield* acceptedResolutionRef({
      workspace,
      type: intent.type,
      name: intent.name,
    });
    return Option.flatMap(accepted, (ref) =>
      ref.refType === "registry" && ref.owner === intent.owner && ref.name === intent.name
        ? Option.some({
            version: ref.version,
            publisherBindingId: ref.publisherBindingId,
          })
        : Option.none(),
    );
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
      return makeOperationResolution({
        name: `Update ${args.intent.target}`,
        description: Option.some(
          `Preserve ${args.intent.target} until its selected release is eligible`,
        ),
        mode: "apply",
        atomicity: { declared: "candidate-atomic", applied: "candidate-atomic" },
        units: [],
        presentation: updatePresentation(args.intent.type),
        releaseAge,
      });
    }
    return makeOperationResolution({
      name: `Update ${args.intent.target}`,
      description: Option.some(`Update ${args.intent.target}`),
      mode: "apply",
      atomicity: { declared: "candidate-atomic", applied: "candidate-atomic" },
      units: [],
      presentation: updatePresentation(args.intent.type),
      releaseAge,
      blocking: {
        class: "policy-excluded",
        subject: args.intent.target,
        phase: "planning",
        detail: `${args.intent.target}'s selected release is held by the minimum release age until ${args.evidence.eligibleAt}`,
        causeCode: "conflict",
      },
      suggestions: [
        {
          description: `Wait until ${args.evidence.eligibleAt}, request an eligible older version, or retry with --ignore-release-age.`,
        },
      ],
    });
  });

interface TargetedUpdateResolution {
  readonly resolution: OperationResolution;
  readonly context?: TargetedUpdatePublicContext;
}

const blockerDetail = (context: TargetedUpdatePublicContext): string => {
  switch (context.blocker) {
    case "not-desired":
      return `${context.target.fqn} is not desired by this workspace`;
    case "disabled":
      return `${context.target.fqn} is effectively disabled`;
    case "pack-owned-constraint":
      return `${context.target.fqn} is pack-owned; a targeted version range would create direct intent`;
    case "incomplete-graph":
      return `Pack membership is incomplete, so ownership of ${context.target.fqn} cannot be proven`;
    case "constraint-conflict":
      return `The desired constraints for ${context.target.fqn} have no compatible intersection`;
    case "source-authority":
      return `${context.target.fqn} is workspace-authored and cannot be replaced from the Registry`;
    case "stale-plan":
      return TARGETED_UPDATE_STALE_DETAIL;
    case undefined:
      return `Update ${context.target.fqn} is blocked`;
    default:
      return `Update ${context.target.fqn} is blocked`;
  }
};

const blockerSuggestions = (
  context: TargetedUpdatePublicContext,
): ReadonlyArray<{ readonly description: string; readonly cmd?: string }> => {
  switch (context.blocker) {
    case "not-desired":
      return [
        {
          description: "Install the extension to create direct workspace intent",
          cmd: `axm install ${context.target.fqn}`,
        },
      ];
    case "disabled":
      return [
        {
          description: "Enable the desired extension before updating it",
          cmd: `axm ${toExtensionTypePlural(context.target.type)} enable ${context.target.name}`,
        },
      ];
    case "pack-owned-constraint":
      return [
        {
          description: "Rerun without a version range to preserve pack ownership",
          cmd: `axm update ${context.target.fqn}`,
        },
      ];
    case "incomplete-graph":
      return [{ description: "Preview workspace reconciliation", cmd: "axm sync --preview" }];
    case "constraint-conflict":
      return context.packs.map((pack) =>
        pack.source === "workspace"
          ? {
              description: `Replace ${pack.fqn}'s authored member constraint`,
              cmd: `axm packs add ${pack.fqn} ${context.target.fqn}`,
            }
          : {
              description: `Update ${pack.fqn} if its owner published a compatible constraint`,
              cmd: `axm update ${pack.fqn}`,
            },
      );
    case "source-authority":
      return [
        {
          description: "Update the workspace-authored source, then reconcile it",
          cmd: `axm sync ${context.target.fqn} --preview`,
        },
      ];
    case "stale-plan":
      return [
        {
          description: "Rerun the command to classify a fresh ownership context",
          cmd: `axm update ${context.target.fqn}`,
        },
      ];
    case undefined:
      return [];
    default:
      return [];
  }
};

const blockerClass = (
  context: TargetedUpdatePublicContext,
): "precondition-unmet" | "policy-excluded" | "stale-candidate" => {
  switch (context.blocker) {
    case "pack-owned-constraint":
    case "source-authority":
      return "policy-excluded";
    case "stale-plan":
      return "stale-candidate";
    default:
      return "precondition-unmet";
  }
};

const blockedTargetedUpdate = (
  context: TargetedUpdatePublicContext,
  mode: "preview" | "apply",
): OperationResolution => {
  const suggestions = blockerSuggestions(context);
  return makeOperationResolution({
    name: `Update ${context.target.fqn}`,
    description: Option.some(blockerDetail(context)),
    mode,
    atomicity: { declared: "candidate-atomic", applied: "candidate-atomic" },
    units: [],
    presentation: operationPresentation(
      { imperative: "update", past: "Updated", gerund: "Updating" },
      context.target.type,
    ),
    blocking: {
      class: blockerClass(context),
      subject: context.target.fqn,
      phase: "planning",
      detail: blockerDetail(context),
      causeCode: "conflict",
      ...(context.blocker === undefined ? {} : { reference: context.blocker }),
      ...(suggestions[0] === undefined
        ? {}
        : {
            escape: suggestions[0],
          }),
    },
    suggestions,
  });
};

const staleOutputContext = (context: TargetedUpdatePublicContext): TargetedUpdatePublicContext => ({
  ...context,
  authority: "blocked",
  blocker: "stale-plan",
  effects: {
    settings: "unchanged",
    acceptedResolution: "unchanged",
    canonical: "unchanged",
    projection: "unchanged",
    packRoot: "unchanged",
    packManifest: "unchanged",
  },
});

const contextForResolution = (
  context: TargetedUpdatePublicContext,
  resolution: OperationResolution,
): TargetedUpdatePublicContext =>
  resolution.blocking?.class === "stale-candidate" ? staleOutputContext(context) : context;

const resolveTargetedUpdate = (
  intent: RootUpdateIntent,
  execution: PlanExecution,
  ignoreReleaseAge: boolean,
) =>
  Effect.gen(function* () {
    let targetedContext: TargetedUpdateContext | undefined;
    if (intent.type !== "pack") {
      targetedContext = yield* resolveTargetedUpdateContext({
        target: { type: intent.type, name: intent.name, fqn: intent.target },
        ...(Option.isNone(intent.versionRange) ? {} : { explicitRange: intent.versionRange.value }),
      });
      if (targetedContext.public.blocker !== undefined) {
        return {
          resolution: blockedTargetedUpdate(targetedContext.public, execution.request.mode),
          context: targetedContext.public,
        } satisfies TargetedUpdateResolution;
      }
    }

    const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation(
      ignoreReleaseAge ? "ignore" : "enforce",
    );
    const source = yield* resolveSource(intent.source);
    if (source.type !== "registry") {
      return yield* makeAppError({ code: "usage", detail: "Root update requires a Registry FQN" });
    }
    const providers = yield* SourceHostProviders;
    const accepted = yield* acceptedRegistryFloor(intent);
    const selected = yield* providers.resolveNamedRegistry(source, {
      name: intent.name,
      type: intent.type,
      owner: intent.owner,
      versionRange:
        targetedContext?.public.effectiveConstraint === undefined
          ? intent.versionRange
          : Option.some(decodeVersionRangeSync(targetedContext.public.effectiveConstraint)),
      releaseAgeEvaluation,
      ...(Option.isSome(accepted) ? { accepted: accepted.value } : {}),
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
    const evaluatedAtText = DateTime.formatIso(releaseAgeEvaluation.evaluatedAt);
    if (selected.kind === "policy_held") {
      const resolution = yield* heldTargetResolution({
        intent,
        evidence: selected.candidate,
        evaluatedAt: evaluatedAtText,
      });
      return {
        resolution,
        ...(targetedContext === undefined ? {} : { context: targetedContext.public }),
      } satisfies TargetedUpdateResolution;
    }

    let resolution: OperationResolution;
    if (targetedContext?.public.authority === "pack-aware") {
      if (selected.ref.type === "pack") {
        return yield* makeAppError({
          code: "internal",
          detail: `Registry resolved ${intent.target} as an unexpected pack`,
        });
      }
      if (selected.ref.type !== intent.type) {
        return yield* makeAppError({
          code: "internal",
          detail: `Registry resolved ${intent.target} as ${selected.ref.type}, expected ${intent.type}`,
        });
      }
      const memberStep = yield* buildPackMemberInstallStep({
        ref: selected.ref,
        graphComplete: true,
      });
      const plan = yield* wrapTargetedUpdatePlan({
        plan: {
          _tag: "Plan",
          name: `Update ${intent.target}`,
          description: Option.some(`Update pack-derived member ${intent.target}`),
          jobs: [{ concurrency: 1, steps: [memberStep] }],
        },
        context: targetedContext,
      });
      resolution = yield* previewOrApplyPlan(plan, { execution });
    } else {
      const durableRange =
        intent.type === "pack"
          ? intent.versionRange
          : Option.fromUndefinedOr(
              Option.getOrUndefined(intent.versionRange) ??
                targetedContext?.public.direct?.constraint,
            ).pipe(Option.map(decodeVersionRangeSync));
      const exactIntent = {
        ...intent,
        source: `${intent.target}@${selected.ref.version}`,
        versionRange: durableRange,
      };
      resolution = yield* runUpdateIntent(
        exactIntent,
        execution,
        releaseAgeEvaluation,
        targetedContext === undefined
          ? (plan) =>
              Effect.succeed({
                ...plan,
                presentation: updatePresentation(intent.type),
              } satisfies Plan)
          : (plan) =>
              wrapTargetedUpdatePlan({
                plan,
                context: targetedContext,
                ...(Option.isNone(intent.versionRange)
                  ? {}
                  : { explicitRange: intent.versionRange.value }),
              }),
      );
    }
    const holdbacks =
      selected.kind === "exempted" || selected.newerHeld === undefined
        ? []
        : [
            releaseAgeRecord({
              intent,
              evidence: selected.newerHeld,
              selectedVersion: selected.ref.version,
              ...(Option.isSome(accepted) && accepted.value.version === selected.ref.version
                ? { currentVersion: accepted.value.version }
                : {}),
            }),
          ];
    const bypasses =
      selected.kind === "selected"
        ? []
        : [
            {
              ...releaseAgeRecord({
                intent,
                evidence: selected.bypassed,
                selectedVersion: selected.ref.version,
              }),
              ...selected.exemption,
            },
          ];
    const withEvidence = withReleaseAge(resolution, {
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
    return {
      resolution: withEvidence,
      ...(targetedContext === undefined
        ? {}
        : { context: contextForResolution(targetedContext.public, withEvidence) }),
    } satisfies TargetedUpdateResolution;
  });

export const handleUpdate = (args: RootUpdateHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "update",
      mode: args.preview ? "preview" : "apply",
      planName: "Update configured extensions",
      presentation: operationPresentation({
        imperative: "update",
        past: "Updated",
        gerund: "Updating",
      }),
    },
    handleUpdateBody(args),
  );

const handleUpdateBody = (args: RootUpdateHandlerArgs) =>
  Option.match(args.source, {
    onNone: () =>
      handleWorkspaceUpdate({
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
        const resolved = yield* resolveTargetedUpdate(
          intent,
          execution,
          args.ignoreReleaseAge === true,
        );
        const outputResolution = resolved.resolution;
        yield* setCommandSemanticProperties(
          summarizeCommandOutcome(
            operationResolutionSummary(outputResolution, {
              subjectType: intent.type,
              sourceKind: "registry",
            }),
          ),
        );
        yield* emitOperationResolution("update", outputResolution, {
          suggestions: [{ description: "Inspect installed extensions", cmd: "axm list" }],
          ...(resolved.context === undefined ? {} : { targetedUpdate: resolved.context }),
        });
      }),
  });
