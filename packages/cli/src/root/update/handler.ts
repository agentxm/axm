import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
} from "@agentxm/extension-management/unstable/cli-runtime";
import {
  previewOrApplyPlan,
  credentialFreeLocatorRecoveryValue,
  recoveryPositional,
  recoverySwitch,
  type PlanExecution,
} from "@agentxm/workspace-operations";
import type { OperationResolution, Plan } from "@agentxm/workspace-operations";
import { makeOperationResolution, operationPresentation } from "@agentxm/workspace-operations";
import {
  makeConfiguredReleaseAgeEvaluation,
  runInstallCommandWorkflow,
} from "@agentxm/extension-management/unstable/extension-lifecycle";
import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import {
  normalizeReleaseAgeRecords,
  type ReleaseAgeHoldbackRecord,
  type ReleaseAgeOperationEvidence,
} from "@agentxm/registry-protocol/unstable/registry/release-age-policy";
import {
  type ReleaseAgeEvaluation,
  type ReleaseAgeEvidence,
} from "@agentxm/extension-model/unstable/extensions/release-age";
import {
  SourceHostProviders,
  resolveSource,
} from "@agentxm/extension-management/unstable/source-resolution";
import {
  WorkspaceMutations,
  acceptedResolutionRef,
  usableAcceptedCanonical,
} from "@agentxm/workspace-state";
import {
  decodeVersionRangeSync,
  versionSatisfiesRange,
} from "@agentxm/extension-model/unstable/version-constraints";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions";

import { emitOperationResolution, operationResolutionSummary } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { type InstallMcpServerHandlerArgs } from "../mcps/install/command-actions.js";
import { type InstallHookHandlerArgs } from "../hooks/install/command-actions.js";
import { type InstallKnowledgeHandlerArgs } from "../knowledge/install/command-actions.js";
import { type InstallPackHandlerArgs } from "../packs/install/command-actions.js";
import { type InstallRuleHandlerArgs } from "../rules/install/command-actions.js";
import { resolveRootUpdateIntent, type RootUpdateIntent } from "./resolve-root-update-intent.js";
import { handleWorkspaceUpdateWithActions } from "./workspace-update-handler.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import { buildPackMemberInstallStep } from "../packs/member-install-step.js";
import {
  resolveTargetedUpdateContext,
  type TargetedUpdateContext,
  type TargetedUpdatePublicContext,
} from "./targeted-update-context.js";
import { TARGETED_UPDATE_STALE_DETAIL, wrapTargetedUpdatePlan } from "./targeted-update-plan.js";
import {
  makeInstallCommandActions,
  type InstallCommandActions,
} from "../shared/install-command-actions.js";

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
  actions: InstallCommandActions,
  releaseAgeEvaluation?: ReleaseAgeEvaluation,
  transformPlan?: (plan: Plan) => Effect.Effect<Plan, AppError, WorkspaceMutations>,
) =>
  Effect.gen(function* () {
    switch (intent.type) {
      case "skill": {
        return yield* runInstallCommandWorkflow(
          { source: intent.source, skills: [], all: false },
          actions.skill,
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
        const mcpArgs: InstallMcpServerHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(mcpArgs, actions.mcpServer, {
          execution,
          ...(transformPlan === undefined ? {} : { transformPlan }),
          transformIntent: (resolved) => ({ ...resolved, versionRange: intent.versionRange }),
        });
      }
      case "rule": {
        const ruleArgs: InstallRuleHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(ruleArgs, actions.rule, {
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
        const hookArgs: InstallHookHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(hookArgs, actions.hook, {
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
        const knowledgeArgs: InstallKnowledgeHandlerArgs = { source: intent.source };
        return yield* runInstallCommandWorkflow(knowledgeArgs, actions.knowledge, {
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
        return yield* runInstallCommandWorkflow(
          { source: intent.source, subagents: [], all: false },
          actions.subagent,
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
        return yield* runInstallCommandWorkflow(packArgs, actions.pack, {
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
        atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
        units: [],
        presentation: updatePresentation(args.intent.type),
        releaseAge,
      });
    }
    return makeOperationResolution({
      name: `Update ${args.intent.target}`,
      description: Option.some(`Update ${args.intent.target}`),
      mode: "apply",
      atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
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
  const withRelevantProblems = (detail: string): string =>
    context.relevantProblems.length === 0
      ? detail
      : `${detail}. ${context.relevantProblems.join("; ")}`;

  switch (context.blocker) {
    case "not-desired":
      return `${context.target.fqn} is not desired by this workspace`;
    case "disabled":
      return `${context.target.fqn} is effectively disabled`;
    case "pack-owned-constraint":
      return `${context.target.fqn} is pack-owned; a targeted version range would create direct intent`;
    case "incomplete-graph":
      return withRelevantProblems(
        `Pack membership is incomplete, so ownership of ${context.target.fqn} cannot be proven`,
      );
    case "constraint-conflict":
      return withRelevantProblems(
        `The desired constraints for ${context.target.fqn} have no compatible intersection`,
      );
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
    atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
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
  actions: InstallCommandActions,
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
        actions,
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

const handleUpdateWithActionEffect = <R>(
  args: RootUpdateHandlerArgs,
  actionsEffect: Effect.Effect<InstallCommandActions, never, R>,
) =>
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
    Effect.flatMap(actionsEffect, (actions) => handleUpdateBody(args, actions)),
  );

export const handleUpdate = (args: RootUpdateHandlerArgs) =>
  handleUpdateWithActionEffect(args, makeInstallCommandActions);

export const handleUpdateWithActions = (
  args: RootUpdateHandlerArgs,
  actions: InstallCommandActions,
) => handleUpdateWithActionEffect(args, Effect.succeed(actions));

const handleUpdateBody = (args: RootUpdateHandlerArgs, actions: InstallCommandActions) =>
  Effect.gen(function* () {
    if (Option.isNone(args.source)) {
      return yield* handleWorkspaceUpdateWithActions(
        {
          command: "update",
          type: Option.none(),
          planName: "Update configured extensions",
          planDescription: Option.some("Update configured workspace extensions"),
          flags: args,
        },
        actions,
      );
    }

    const source = args.source.value;
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
      actions,
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
  });
