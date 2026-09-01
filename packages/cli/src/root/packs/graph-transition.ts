import * as Effect from "effect/Effect";

import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import type {
  JobStepArtifact,
  JobStepResult,
  PlannedJobStep,
  ReadyJobStep,
  WarnJobStep,
} from "@agentxm/extension-management/unstable/plan";
import {
  desiredStateProblemsText,
  WorkspaceMutations,
  type DesiredExtensionNode,
} from "@agentxm/extension-management/unstable/workspace";
import { surfaceRestorationIncomplete } from "@agentxm/extension-management/unstable/workspace";
import { appErrorToStepFailure } from "@agentxm/extension-management/unstable/app-error/conversions";

const normalizedIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const failedStep = (label: string, result: JobStepResult) =>
  result.result === "error"
    ? Effect.fail(
        result.error ??
          makeAppError({
            code: "internal",
            detail: `${label} failed: ${result.message}`,
          }),
      )
    : Effect.succeed(result);

export interface AtomicPackGraphChild {
  readonly step: PlannedJobStep;
  readonly coverage: "eligible" | "ineligible";
}

interface PackCoverage {
  readonly applicable: boolean;
  readonly agents: ReadonlyArray<string>;
}

const aggregatePackCoverage = (
  results: ReadonlyArray<{
    readonly result: JobStepResult;
    readonly coverage: AtomicPackGraphChild["coverage"];
  }>,
  scope: JobStepArtifact["scope"],
): Effect.Effect<PackCoverage, AppError> =>
  Effect.gen(function* () {
    const applicableArtifacts = results.flatMap(({ result, coverage }) =>
      coverage === "eligible" &&
      result.result === "success" &&
      result.artifact?.agents !== undefined
        ? [result.artifact]
        : [],
    );
    const agents: Array<string> = [];
    for (const artifact of applicableArtifacts) {
      if (artifact.scope !== scope) {
        return yield* makeAppError({
          code: "internal",
          detail: `Pack coverage spans ${scope} and ${artifact.scope} scopes`,
        });
      }
      const artifactAgents = new Set(artifact.agents);
      for (const target of artifact.targets ?? []) {
        for (const agent of target.agentIds ?? []) {
          if (!artifactAgents.has(agent)) {
            return yield* makeAppError({
              code: "internal",
              detail: `Pack child target agent ${agent} is absent from its artifact agents`,
            });
          }
        }
      }
      for (const agent of artifact.agents ?? []) {
        if (agent !== "universal" && !agents.includes(agent)) agents.push(agent);
      }
    }
    return { applicable: applicableArtifacts.length > 0, agents };
  });

export const buildAtomicPackGraphStep = (args: {
  readonly label: string;
  readonly message: string;
  readonly artifact: JobStepArtifact;
  readonly children: ReadonlyArray<AtomicPackGraphChild>;
  readonly reportUnchangedWhenChildrenUnchanged?: boolean;
  readonly preTransition?: Effect.Effect<void, AppError, WorkspaceMutations>;
  readonly validate: Effect.Effect<void, AppError, WorkspaceMutations>;
}): Effect.Effect<PlannedJobStep, never, WorkspaceMutations> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const readinessErrors = args.children.flatMap(({ step }) =>
      step.readiness === "error" ? [step.errorMessage] : [],
    );
    if (readinessErrors.length > 0) {
      const blockingConditionIds = args.children.flatMap(({ step }) =>
        step.readiness === "error" ? (step.blockingConditionIds ?? []) : [],
      );
      return {
        readiness: "error",
        label: args.label,
        errorMessage: readinessErrors.join("; "),
        artifact: args.artifact,
        ...(blockingConditionIds.length === 0 ? {} : { blockingConditionIds }),
      } satisfies PlannedJobStep;
    }

    const readinessWarnings = args.children.flatMap(({ step }) =>
      step.readiness === "warn" ? [step.warnMessage] : [],
    );
    const runnableChildren = args.children.filter(
      (child): child is AtomicPackGraphChild & { readonly step: ReadyJobStep | WarnJobStep } =>
        child.step.readiness !== "error",
    );
    let validatedCoverage: PackCoverage = { applicable: false, agents: [] };
    const run = ws
      .runTransaction({
        transition: Effect.gen(function* () {
          if (args.preTransition !== undefined) {
            yield* args.preTransition.pipe(Effect.provideService(WorkspaceMutations, ws));
          }
          return yield* Effect.forEach(
            runnableChildren,
            ({ step, coverage }) =>
              step.run.pipe(
                Effect.flatMap((result) => failedStep(step.label, result)),
                Effect.map((result) => ({ result, coverage })),
              ),
            { concurrency: 1 },
          );
        }),
        validate: (results) =>
          Effect.gen(function* () {
            yield* args.validate.pipe(Effect.provideService(WorkspaceMutations, ws));
            validatedCoverage = yield* aggregatePackCoverage(results, args.artifact.scope);
          }),
      })
      .pipe(surfaceRestorationIncomplete)
      .pipe(
        Effect.mapError((error) =>
          error._tag === "AppError" ? appErrorToStepFailure(error) : error,
        ),
        Effect.map((results) => {
          const warnings = results.flatMap(({ result }) => result.warnings ?? []);
          const allChildrenUnchanged =
            args.reportUnchangedWhenChildrenUnchanged === true &&
            results.length > 0 &&
            results.every(
              ({ result }) =>
                result.result === "success" && result.artifact?.change === "unchanged",
            );
          const artifact = allChildrenUnchanged
            ? { ...args.artifact, change: "unchanged" as const }
            : args.artifact;
          return {
            result: "success",
            message: args.message,
            artifact: !validatedCoverage.applicable
              ? artifact
              : { ...artifact, agents: validatedCoverage.agents },
            ...(warnings.length === 0 ? {} : { warnings }),
          } satisfies JobStepResult;
        }),
      );

    return readinessWarnings.length === 0
      ? ({
          readiness: "ready",
          label: args.label,
          artifact: args.artifact,
          run,
        } satisfies PlannedJobStep)
      : ({
          readiness: "warn",
          label: args.label,
          warnMessage: readinessWarnings.join("; "),
          artifact: args.artifact,
          run,
        } satisfies PlannedJobStep);
  });

interface RequiredPack {
  readonly name: string;
  readonly identity: string;
  readonly enabled?: boolean;
}

interface RequiredMember {
  readonly type: Exclude<DesiredExtensionNode["type"], "pack">;
  readonly name: string;
  readonly packIdentity?: string;
  readonly direct?: boolean;
  readonly enabled?: boolean;
}

interface AbsentNode {
  readonly type: DesiredExtensionNode["type"];
  readonly name: string;
}

export const validatePackGraphPostcondition = (args: {
  readonly requiredPacks?: ReadonlyArray<RequiredPack>;
  readonly requiredMembers?: ReadonlyArray<RequiredMember>;
  readonly absent?: ReadonlyArray<AbsentNode>;
  readonly inactive?: ReadonlyArray<AbsentNode>;
}): Effect.Effect<void, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const graph = yield* ws.getDesiredStateGraph();
    const requiredPackIdentities = new Set(
      (args.requiredPacks ?? []).map((pack) => normalizedIdentity(pack.identity)),
    );
    const requiredMemberKeys = new Set(
      (args.requiredMembers ?? []).map((member) => `${member.type}:${member.name}`),
    );
    const relevantProblems = graph.problems.filter((problem) => {
      switch (problem.type) {
        case "pack-manifest-unavailable":
        case "pack-manifest-invalid":
        case "pack-identity-mismatch":
        case "pack-resolution-unavailable":
        case "pack-manifest-content-mismatch":
          return requiredPackIdentities.has(normalizedIdentity(problem.pack));
        case "projection-collision":
        case "constraint-conflict":
          return requiredMemberKeys.has(`${problem.extensionType}:${problem.name}`);
        case "workspace-owner-missing":
          return requiredMemberKeys.has(`${problem.extensionType}:${problem.name}`);
      }
    });
    if (relevantProblems.length > 0) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Pack transition left its desired member graph incomplete: ${desiredStateProblemsText(relevantProblems)}`,
      });
    }

    for (const expected of args.requiredPacks ?? []) {
      const node = graph.nodes.find(
        (candidate) => candidate.type === "pack" && candidate.name === expected.name,
      );
      if (
        node === undefined ||
        normalizedIdentity(node.identity) !== normalizedIdentity(expected.identity) ||
        (expected.enabled !== undefined && node.enabled !== expected.enabled)
      ) {
        const expectedPredicate = [
          `identity ${normalizedIdentity(expected.identity)}`,
          ...(expected.enabled === undefined
            ? []
            : [`activation ${expected.enabled ? "enabled" : "disabled"}`]),
        ].join(", ");
        const observedPredicate =
          node === undefined
            ? "absent"
            : `identity ${normalizedIdentity(node.identity)}, activation ${node.enabled ? "enabled" : "disabled"}`;
        return yield* makeAppError({
          code: "internal",
          detail: `Pack graph closure ${expected.identity} failed its desired-state predicate: expected ${expectedPredicate}; observed ${observedPredicate}`,
        });
      }
    }

    for (const expected of args.requiredMembers ?? []) {
      const node = graph.nodes.find(
        (candidate) => candidate.type === expected.type && candidate.name === expected.name,
      );
      const packIdentity = expected.packIdentity;
      const hasPackOrigin =
        packIdentity === undefined ||
        node?.origins.some(
          (origin) =>
            origin.type === "pack" &&
            normalizedIdentity(origin.pack) === normalizedIdentity(packIdentity),
        ) === true;
      const hasDirectOrigin =
        expected.direct !== true ||
        node?.origins.some((origin) => origin.type === "settings") === true;
      if (
        node === undefined ||
        !hasPackOrigin ||
        !hasDirectOrigin ||
        (expected.enabled !== undefined && node.enabled !== expected.enabled)
      ) {
        const expectedPredicate = [
          ...(packIdentity === undefined
            ? []
            : [`Pack ownership ${normalizedIdentity(packIdentity)}`]),
          ...(expected.direct === true ? ["direct ownership"] : []),
          ...(expected.enabled === undefined
            ? []
            : [`activation ${expected.enabled ? "enabled" : "disabled"}`]),
        ].join(", ");
        const observedPredicate =
          node === undefined
            ? "absent"
            : `origins ${
                node.origins
                  .map((origin) =>
                    origin.type === "pack"
                      ? `Pack ${normalizedIdentity(origin.pack)}`
                      : "direct settings",
                  )
                  .join(", ") || "none"
              }, activation ${node.enabled ? "enabled" : "disabled"}`;
        return yield* makeAppError({
          code: "internal",
          detail: `Pack graph closure ${packIdentity ?? "unknown"} failed the ${expected.type} "${expected.name}" desired-state predicate: expected ${expectedPredicate || "reachable"}; observed ${observedPredicate}`,
        });
      }
    }

    for (const expected of args.absent ?? []) {
      if (
        graph.nodes.some(
          (candidate) => candidate.type === expected.type && candidate.name === expected.name,
        )
      ) {
        return yield* makeAppError({
          code: "internal",
          detail: `${expected.type} "${expected.name}" remained in the desired graph after the pack transition`,
        });
      }
    }

    for (const expected of args.inactive ?? []) {
      const node = graph.nodes.find(
        (candidate) => candidate.type === expected.type && candidate.name === expected.name,
      );
      if (node === undefined || node.enabled) {
        return yield* makeAppError({
          code: "internal",
          detail: `${expected.type} "${expected.name}" did not remain reachable and inactive after the Pack transition`,
        });
      }
    }
  });
