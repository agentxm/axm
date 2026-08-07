import * as Effect from "effect/Effect";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import type {
  JobStepArtifact,
  JobStepResult,
  PlannedJobStep,
  ReadyJobStep,
  WarnJobStep,
} from "@agentxm/client-core/unstable/plan";
import {
  WorkspaceMutations,
  type DesiredExtensionNode,
} from "@agentxm/client-core/unstable/workspace";

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

export const buildAtomicPackGraphStep = (args: {
  readonly label: string;
  readonly message: string;
  readonly artifact: JobStepArtifact;
  readonly steps: ReadonlyArray<PlannedJobStep>;
  readonly validate: Effect.Effect<void, AppError, WorkspaceMutations>;
}): Effect.Effect<PlannedJobStep, never, WorkspaceMutations> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const readinessErrors = args.steps.flatMap((step) =>
      step.readiness === "error" ? [step.errorMessage] : [],
    );
    if (readinessErrors.length > 0) {
      return {
        readiness: "error",
        label: args.label,
        errorMessage: readinessErrors.join("; "),
        artifact: args.artifact,
      } satisfies PlannedJobStep;
    }

    const readinessWarnings = args.steps.flatMap((step) =>
      step.readiness === "warn" ? [step.warnMessage] : [],
    );
    const runnableSteps = args.steps.filter(
      (step): step is ReadyJobStep | WarnJobStep => step.readiness !== "error",
    );
    const run = ws
      .runTransaction({
        transition: Effect.forEach(
          runnableSteps,
          (step) => step.run.pipe(Effect.flatMap((result) => failedStep(step.label, result))),
          { concurrency: 1 },
        ),
        validate: () => args.validate.pipe(Effect.provideService(WorkspaceMutations, ws)),
      })
      .pipe(
        Effect.map((results) => {
          const warnings = results.flatMap((result) => result.warnings ?? []);
          return {
            result: "success",
            message: args.message,
            artifact: args.artifact,
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
        case "pack-trust-unavailable":
        case "pack-canonical-unusable":
          return requiredPackIdentities.has(normalizedIdentity(problem.pack));
        case "projection-collision":
        case "constraint-conflict":
          return requiredMemberKeys.has(`${problem.extensionType}:${problem.name}`);
      }
    });
    if (relevantProblems.length > 0) {
      return yield* makeAppError({
        code: "internal",
        detail: "Pack transition left its desired member graph incomplete",
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
        return yield* makeAppError({
          code: "internal",
          detail: `Pack ${expected.identity} did not reach its required desired-state postcondition`,
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
        return yield* makeAppError({
          code: "internal",
          detail: `Pack member ${expected.type} "${expected.name}" did not reach its required desired-state postcondition`,
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
  });
