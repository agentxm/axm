/**
 * CLI implementation of the plan-resolution interaction port.
 *
 * Owns the apply confirmation and the plan display gate for
 * `resolveExecutionCandidate`. Progress is not an interaction: the kernel publishes
 * lifecycle events that the Screen observes.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { promptAvailability, Verbosity } from "../cli-flags/index.js";
import { planDoc } from "../operation-view.js";
import { Screen, type ConfirmAsk, type ConfirmChoice } from "../screen/index.js";
import { PlanInteractionFailed } from "@agentxm/workspace/transitions/planning";
import { confirmationRecoverySuggestions } from "@agentxm/workspace/transitions/planning";
import {
  ResolvePlanInteraction,
  type ApplyConfirmation,
  type Plan,
  type ResolvePlanInteractionService,
} from "@agentxm/workspace/transitions/planning";

const confirmApplyChangesMessage = "Apply changes?";

/**
 * The gate. Every plan that reaches it carries a confirmable condition, so the
 * safe choice comes first and `enter` declines.
 */
const gateChoices: readonly [ConfirmChoice<ApplyConfirmation>, ConfirmChoice<ApplyConfirmation>] = [
  { key: "n", word: "no", value: "declined" },
  { key: "y", word: "yes", value: "approved" },
];

const applyChangesAsk: ConfirmAsk<ApplyConfirmation> = {
  _tag: "Confirm",
  question: confirmApplyChangesMessage,
  label: "Apply changes",
  choices: gateChoices,
};

/**
 * The same gate the first time round, where the plan can still be shown in
 * full. Once it has been, there is nothing further to show and the choice goes.
 */
const applyChangesWithDetailsAsk: ConfirmAsk<ApplyConfirmation | "details"> = {
  ...applyChangesAsk,
  choices: [...gateChoices, { key: "d", word: "details", value: "details", transcript: false }],
};

export const ResolvePlanInteractionLive = Layer.effect(
  ResolvePlanInteraction,
  Effect.gen(function* () {
    const screen = yield* Screen;
    const verbosity = yield* Verbosity;
    // The candidate this interaction last presented, so the gate's details
    // answer can show it again without the kernel handing it over twice.
    const presented = yield* Ref.make<Plan<unknown, unknown> | undefined>(undefined);

    const showDetails = Effect.flatMap(Ref.get(presented), (plan) =>
      plan === undefined
        ? Effect.void
        : screen.note(planDoc(plan, { mode: "apply", verbosity: "verbose" })),
    );

    return {
      // One resolution of effective interactivity feeds planning and the
      // screen alike, so an unavailable confirmation resolves as the
      // operation's own blocked outcome, never as a late prompt failure.
      isConfirmationAvailable: promptAvailability,
      confirmApplyChanges: (recovery) =>
        Effect.gen(function* () {
          const guard = {
            message: confirmApplyChangesMessage,
            suggestions: confirmationRecoverySuggestions(recovery, "interactive"),
          };
          const answer = yield* screen.ask(applyChangesWithDetailsAsk, guard);
          if (answer !== "details") return answer;
          yield* showDetails;
          return yield* screen.ask(applyChangesAsk, guard);
        }).pipe(
          Effect.catchTag("QuestionCancelled", () => Effect.succeed("cancelled" as const)),
          Effect.mapError(
            (error) =>
              new PlanInteractionFailed({
                category: error._tag === "OutputWriteFailed" ? "internal" : error.code,
                detail:
                  error._tag === "OutputWriteFailed"
                    ? "The confirmation could not be displayed."
                    : error.detail,
                ...("suggestions" in error && error.suggestions !== undefined
                  ? { suggestions: error.suggestions }
                  : {}),
                cause: error,
              }),
          ),
        ),
      // Review is durable context, independent of terminal animation. Routine
      // preapproved apply needs only the final result; material risks remain visible.
      presentPlan: (plan, options) =>
        Effect.gen(function* () {
          yield* Ref.set(presented, plan);
          if (options.mode === "preview") {
            return yield* screen.result(
              planDoc(plan, { mode: "preview", verbosity: verbosity.level }),
            );
          }
          const hasConfirmableRisk = (plan.riskConditions ?? []).some(
            (condition) => condition.level === "confirmable",
          );
          if (!hasConfirmableRisk && verbosity.level !== "verbose" && verbosity.level !== "debug")
            return;
          yield* screen.note(planDoc(plan, { mode: "apply", verbosity: verbosity.level }));
        }).pipe(
          Effect.mapError(
            (cause) =>
              new PlanInteractionFailed({
                category: "internal",
                detail: "The plan could not be displayed.",
                cause,
              }),
          ),
        ),
    } satisfies ResolvePlanInteractionService;
  }),
);
