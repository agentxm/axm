/**
 * CLI implementation of the plan-resolution interaction port.
 *
 * Owns the prompt-backed apply confirmation and the plan display gate for
 * `previewOrApplyPlan`. Progress is not an interaction: the kernel publishes
 * lifecycle events that the Screen observes.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Terminal from "effect/Terminal";
import { Prompt } from "effect/unstable/cli";
import { requireInteractive } from "../prompt/index.js";
import { promptAvailability, Verbosity } from "../cli-flags/index.js";
import { planDoc } from "../operation-view.js";
import { Screen } from "../screen/index.js";
import { PlanInteractionFailed } from "@agentxm/workspace-operations";
import { confirmationRecoverySuggestions } from "@agentxm/workspace-operations";
import {
  ResolvePlanInteraction,
  type ApplyConfirmation,
  type ResolvePlanInteractionService,
} from "@agentxm/workspace-operations";

const confirmApplyChangesMessage = "Apply changes?";

export const ResolvePlanInteractionLive = Layer.effect(
  ResolvePlanInteraction,
  Effect.gen(function* () {
    const screen = yield* Screen;
    const verbosity = yield* Verbosity;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const terminal = yield* Terminal.Terminal;
    const promptEnvironment = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fileSystem),
      Layer.succeed(Path.Path, path),
      Layer.succeed(Terminal.Terminal, terminal),
    );
    return {
      // One resolution of effective interactivity feeds planning and the
      // screen alike, so an unavailable confirmation resolves as the
      // operation's own blocked outcome, never as a late prompt failure.
      isConfirmationAvailable: promptAvailability,
      confirmApplyChanges: (recovery) =>
        screen
          .prompt(
            requireInteractive(Prompt.confirm({ message: confirmApplyChangesMessage }), {
              message: confirmApplyChangesMessage,
              suggestions: confirmationRecoverySuggestions(recovery, "interactive"),
            }).pipe(Effect.provide(promptEnvironment)),
          )
          .pipe(
            Effect.map((confirmed): ApplyConfirmation => (confirmed ? "approved" : "declined")),
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
      presentPlan: (plan, options) =>
        Effect.suspend(() => {
          const hasConfirmableRisk = (plan.riskConditions ?? []).some(
            (condition) => condition.level === "confirmable",
          );
          if (options.mode !== "preview" && verbosity.level === "quiet" && !hasConfirmableRisk) {
            return Effect.void;
          }
          const doc = planDoc(plan, { mode: options.mode, verbosity: verbosity.level });
          return options.mode === "preview" ? screen.result(doc) : screen.note(doc);
        }),
    } satisfies ResolvePlanInteractionService;
  }),
);
