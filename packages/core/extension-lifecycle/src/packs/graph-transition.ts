/**
 * The atomic pack graph transition.
 *
 * Installing or removing a pack changes the desired graph and every member's
 * canonical content together. Either the whole transition holds or none of it
 * does, so its children run inside one workspace transaction, a stale
 * candidate is caught before the first write, and the resulting graph is
 * checked against the predicate the planner declared.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";

import {
  WorkspaceMutations,
  desiredStateProblemsText,
  type DesiredExtensionNode,
} from "@agentxm/workspace-state";
import { runWorkspaceTransaction } from "@agentxm/workspace-transactions";
import {
  StepFailure,
  type JobStepArtifact,
  type JobStepResult,
  type PlannedJobStep,
  type ReadyJobStep,
  type WarnJobStep,
} from "@agentxm/workspace-operations";

import type { ExtensionLifecycleFailed } from "../errors.js";
import { lifecycleStepFailure, type LifecycleStepFailure } from "../step-failure.js";
import { installRefused, type InstallStepRequirements } from "../install/vocabulary.js";

const normalizedIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const failedStep = (
  label: string,
  result: JobStepResult,
): Effect.Effect<JobStepResult, StepFailure> =>
  result.result === "error"
    ? Effect.fail(
        result.error ??
          lifecycleStepFailure(
            installRefused({
              category: "internal",
              detail: `${label} failed: ${result.message}`,
            }),
          ),
      )
    : Effect.succeed(result);

export interface AtomicPackGraphChild {
  readonly step: PlannedJobStep<InstallStepRequirements>;
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
): Effect.Effect<PackCoverage, ExtensionLifecycleFailed> =>
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
        return yield* installRefused({
          category: "internal",
          detail: `Pack coverage spans ${scope} and ${artifact.scope} scopes`,
        });
      }
      const artifactAgents = new Set(artifact.agents);
      for (const target of artifact.targets ?? []) {
        for (const agent of target.agentIds ?? []) {
          if (!artifactAgents.has(agent)) {
            return yield* installRefused({
              category: "internal",
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

/**
 * What a pack transition checks before it writes and after it commits. The
 * checks are the planner's, so their failure family and their requirements
 * travel with them rather than being fixed here.
 */
export interface AtomicPackGraphStepArgs<E extends LifecycleStepFailure, R> {
  readonly label: string;
  readonly message: string;
  readonly artifact: JobStepArtifact;
  readonly children: ReadonlyArray<AtomicPackGraphChild>;
  readonly reportUnchangedWhenChildrenUnchanged?: boolean;
  /** A stale-candidate check that runs under the transition, before any write. */
  readonly preTransition?: Effect.Effect<void, E, R>;
  /** The desired-graph predicate the committed transition must satisfy. */
  readonly validate: Effect.Effect<void, E, R>;
}

/** Wrap a pack transition's children in one workspace transaction. */
export const buildAtomicPackGraphStep = <E extends LifecycleStepFailure, R>(
  args: AtomicPackGraphStepArgs<E, R>,
): Effect.Effect<PlannedJobStep<InstallStepRequirements | R>> =>
  Effect.sync(() => {
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
      } satisfies PlannedJobStep<InstallStepRequirements | R>;
    }

    const readinessWarnings = args.children.flatMap(({ step }) =>
      step.readiness === "warn" ? [step.warnMessage] : [],
    );
    const runnableChildren = args.children.filter(
      (child): child is AtomicPackGraphChild & { readonly step: ReadyJobStep | WarnJobStep } =>
        child.step.readiness !== "error",
    );
    let validatedCoverage: PackCoverage = { applicable: false, agents: [] };
    const run = runWorkspaceTransaction({
      transition: Effect.gen(function* () {
        if (args.preTransition !== undefined) {
          yield* args.preTransition.pipe(Effect.mapError(lifecycleStepFailure));
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
          yield* args.validate;
          validatedCoverage = yield* aggregatePackCoverage(results, args.artifact.scope);
        }).pipe(Effect.mapError(lifecycleStepFailure)),
    }).pipe(
      Effect.mapError(lifecycleStepFailure),
      Effect.map((results) => {
        const warnings = results.flatMap(({ result }) =>
          result.result === "success" ? (result.warnings ?? []) : [],
        );
        const allChildrenUnchanged =
          args.reportUnchangedWhenChildrenUnchanged === true &&
          results.length > 0 &&
          results.every(
            ({ result }) => result.result === "success" && result.artifact?.change === "unchanged",
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
        } satisfies PlannedJobStep<InstallStepRequirements | R>)
      : ({
          readiness: "warn",
          label: args.label,
          warnMessage: readinessWarnings.join("; "),
          artifact: args.artifact,
          run,
        } satisfies PlannedJobStep<InstallStepRequirements | R>);
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

/** The desired-graph predicate a completed pack transition must satisfy. */
export const validatePackGraphPostcondition = (args: {
  readonly requiredPacks?: ReadonlyArray<RequiredPack>;
  readonly requiredMembers?: ReadonlyArray<RequiredMember>;
  readonly absent?: ReadonlyArray<AbsentNode>;
  readonly inactive?: ReadonlyArray<AbsentNode>;
}): Effect.Effect<void, ExtensionLifecycleFailed, WorkspaceMutations> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const graph = yield* ws.getDesiredStateGraph().pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "internal",
          detail: "Desired state could not be read after the pack transition",
          cause,
        }),
      ),
    );
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
        case "workspace-owner-missing":
          return requiredMemberKeys.has(`${problem.extensionType}:${problem.name}`);
      }
    });
    if (relevantProblems.length > 0) {
      return yield* installRefused({
        category: "conflict",
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
        return yield* installRefused({
          category: "internal",
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
        return yield* installRefused({
          category: "internal",
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
        return yield* installRefused({
          category: "internal",
          detail: `${expected.type} "${expected.name}" remained in the desired graph after the pack transition`,
        });
      }
    }

    for (const expected of args.inactive ?? []) {
      const node = graph.nodes.find(
        (candidate) => candidate.type === expected.type && candidate.name === expected.name,
      );
      if (node === undefined || node.enabled) {
        return yield* installRefused({
          category: "internal",
          detail: `${expected.type} "${expected.name}" did not remain reachable and inactive after the Pack transition`,
        });
      }
    }
  });
