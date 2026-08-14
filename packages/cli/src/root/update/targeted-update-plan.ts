import * as Effect from "effect/Effect";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";

import { buildAtomicPackGraphStep, type AtomicPackGraphChild } from "../packs/graph-transition.js";
import {
  resolveTargetedUpdateContext,
  type TargetedUpdateContext,
} from "./targeted-update-context.js";

export const TARGETED_UPDATE_STALE_DETAIL =
  "The targeted update ownership context became stale before apply.";

const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const validatePostcondition = (args: {
  readonly expected: TargetedUpdateContext;
  readonly actual: TargetedUpdateContext;
  readonly explicitRange?: string;
}): Effect.Effect<void, AppError> => {
  if (args.explicitRange === undefined) {
    return args.actual.fingerprint === args.expected.fingerprint
      ? Effect.void
      : Effect.fail(
          makeAppError({
            code: "internal",
            detail: "Targeted update changed desired ownership or owning pack evidence",
          }),
        );
  }

  const expectedPublic = args.expected.public;
  const actualPublic = args.actual.public;
  const preserved =
    actualPublic.blocker === undefined &&
    actualPublic.ownership === expectedPublic.ownership &&
    actualPublic.activation === expectedPublic.activation &&
    actualPublic.authority === expectedPublic.authority &&
    actualPublic.direct?.source === expectedPublic.direct?.source &&
    actualPublic.direct?.enabled === expectedPublic.direct?.enabled &&
    actualPublic.direct?.constraint === args.explicitRange &&
    actualPublic.effectiveConstraint === expectedPublic.effectiveConstraint &&
    same(actualPublic.packs, expectedPublic.packs) &&
    same(actualPublic.memberClosure, expectedPublic.memberClosure) &&
    args.actual.packEvidenceFingerprint === args.expected.packEvidenceFingerprint;
  return preserved
    ? Effect.void
    : Effect.fail(
        makeAppError({
          code: "internal",
          detail: "Targeted update did not preserve its desired ownership postcondition",
        }),
      );
};

export const wrapTargetedUpdatePlan = (args: {
  readonly plan: Plan;
  readonly context: TargetedUpdateContext;
  readonly explicitRange?: string;
}): Effect.Effect<Plan, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const children: ReadonlyArray<AtomicPackGraphChild> = args.plan.jobs.flatMap((job) =>
      job.steps.map((step) => ({
        step,
        coverage: args.context.public.target.type === "knowledge" ? "ineligible" : "eligible",
      })),
    );
    const firstArtifact = children.find((child) => child.step.artifact !== undefined)?.step
      .artifact;
    const artifact = firstArtifact ?? {
      path: args.context.public.target.fqn,
      scope: workspace.scope,
      change: "updated" as const,
    };
    const graphStep = yield* buildAtomicPackGraphStep({
      label: args.context.public.target.fqn,
      message: `Updated ${args.context.public.target.fqn}`,
      artifact,
      children,
      reportUnchangedWhenChildrenUnchanged: true,
      preTransition: resolveTargetedUpdateContext({
        target: args.context.public.target,
        ...(args.explicitRange === undefined ? {} : { explicitRange: args.explicitRange }),
      }).pipe(
        Effect.flatMap((fresh) =>
          fresh.fingerprint === args.context.fingerprint
            ? Effect.void
            : Effect.fail(makeAppError({ code: "conflict", detail: TARGETED_UPDATE_STALE_DETAIL })),
        ),
      ),
      validate: resolveTargetedUpdateContext({
        target: args.context.public.target,
        ...(args.explicitRange === undefined ? {} : { explicitRange: args.explicitRange }),
      }).pipe(
        Effect.flatMap((actual) =>
          validatePostcondition({
            expected: args.context,
            actual,
            ...(args.explicitRange === undefined ? {} : { explicitRange: args.explicitRange }),
          }),
        ),
      ),
    });

    return {
      ...args.plan,
      name: `Update ${args.context.public.target.fqn}`,
      description: args.plan.description,
      sections: [
        ...(args.plan.sections ?? []),
        {
          title: "Targeted update authority",
          items: [
            `Ownership: ${args.context.public.ownership}`,
            `Activation: ${args.context.public.activation}`,
            `Authority: ${args.context.public.authority}`,
            ...(args.context.public.effectiveConstraint === undefined
              ? []
              : [`Effective constraint: ${args.context.public.effectiveConstraint}`]),
            ...args.context.public.packs.map(
              (pack) =>
                `Owning pack: ${pack.fqn}${
                  pack.configuredName === undefined ? "" : ` (${pack.configuredName})`
                } ${pack.constraint}; member source ${pack.memberSource}`,
            ),
            `Member closure: ${args.context.public.memberClosure.map((member) => member.fqn).join(", ")}`,
          ],
        },
      ],
      jobs: [{ concurrency: 1, steps: [graphStep] }],
    } satisfies Plan;
  });
