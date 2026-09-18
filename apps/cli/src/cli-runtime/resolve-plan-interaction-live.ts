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
import { livePlan, planDoc } from "../operation-view.js";
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
const gateChoices: ReadonlyArray<ConfirmChoice<ApplyConfirmation>> = [
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
          Effect.catchTag("PromptCancelled", () => Effect.succeed("cancelled" as const)),
          Effect.mapError(
            (error) =>
              new PlanInteractionFailed({
                category: error.code,
                detail: error.detail,
                ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
                ...(error.cause === undefined ? {} : { cause: error.cause }),
              }),
          ),
        ),
      // A preview is the command's result and prints as one. An apply in an
      // animated terminal hands its rows to the live ledger instead, so the
      // plan it showed is the ledger that then streams and settles; where
      // nothing animates the plan stays a transcript note.
      presentPlan: (plan, options) =>
        Effect.gen(function* () {
          yield* Ref.set(presented, plan);
          if (options.mode === "preview") {
            return yield* screen.result(
              planDoc(plan, { mode: "preview", verbosity: verbosity.level }),
            );
          }
          const facts = yield* screen.facts;
          if (facts.animate) {
            const live = livePlan(plan, { verbosity: verbosity.level });
            const visible = live === undefined ? false : yield* screen.showPlan(live);
            if (visible) return;
          }
          const hasConfirmableRisk = (plan.riskConditions ?? []).some(
            (condition) => condition.level === "confirmable",
          );
          if (verbosity.level === "quiet" && !hasConfirmableRisk) return;
          yield* screen.note(planDoc(plan, { mode: "apply", verbosity: verbosity.level }));
        }),
    } satisfies ResolvePlanInteractionService;
  }),
);
