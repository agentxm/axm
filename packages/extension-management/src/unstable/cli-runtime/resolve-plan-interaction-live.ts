/**
 * CLI implementation of the plan-resolution interaction port.
 *
 * Owns the prompt-backed apply confirmation, the plan display gate, the
 * spinner-backed planning and apply progress envelopes, and the
 * transition-wait notice for `previewOrApplyPlan`.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Terminal from "effect/Terminal";
import { Prompt } from "effect/unstable/cli";
import { requireInteractive } from "../cli/prompt/index.js";
import { isNonInteractiveOptional, Verbosity } from "../cli-flags/index.js";
import { CliRenderer, displayPlan } from "../cli-renderer/index.js";
import { PlanInteractionFailed } from "@agentxm/workspace-operations";
import { subscribeToLifecycle } from "@agentxm/workspace-operations";
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
    const renderer = yield* CliRenderer;
    const verbosity = yield* Verbosity;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const terminal = yield* Terminal.Terminal;
    const promptEnvironment = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fileSystem),
      Layer.succeed(Path.Path, path),
      Layer.succeed(Terminal.Terminal, terminal),
    );
    const displayEnvironment = Layer.mergeAll(
      Layer.succeed(CliRenderer, renderer),
      Layer.succeed(Verbosity, verbosity),
    );

    return {
      isConfirmationAvailable: Effect.map(
        isNonInteractiveOptional,
        (nonInteractive) => !nonInteractive,
      ),
      confirmApplyChanges: (recovery) =>
        requireInteractive(Prompt.confirm({ message: confirmApplyChangesMessage }), {
          message: confirmApplyChangesMessage,
          suggestions: confirmationRecoverySuggestions(recovery),
        }).pipe(
          Effect.provide(promptEnvironment),
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
          return options.mode === "preview" || verbosity.level !== "quiet" || hasConfirmableRisk
            ? displayPlan(plan, { mode: options.mode }).pipe(Effect.provide(displayEnvironment))
            : Effect.void;
        }),
      withPlanningProgress: <A, E, R>(planName: string, run: () => Effect.Effect<A, E, R>) =>
        renderer.withSpinner(`Resolving ${planName}`, () => run(), {
          successMessage: `Resolved ${planName}`,
        }),
      withApplyProgress: <A, E, R>(planName: string, run: () => Effect.Effect<A, E, R>) =>
        renderer.withSpinner(
          `Applying ${planName}`,
          (handle) =>
            Effect.scoped(
              subscribeToLifecycle((event) => {
                switch (event._tag) {
                  case "UnitStarted":
                    return handle.update(
                      `Applying ${planName} — ${event.label} (${event.index + 1}/${event.total})`,
                      { unit: event.unitId, atMs: Number(event.atNanos / 1_000_000n) },
                    );
                  case "UnitResolved":
                    return handle.update(
                      `Applying ${planName} — ${event.label}: ${event.state} (${event.index + 1}/${event.total})`,
                      {
                        unit: event.unitId,
                        state: event.state,
                        atMs: Number(event.atNanos / 1_000_000n),
                      },
                    );
                  case "PhaseStarted":
                    return event.phase === "restoration"
                      ? handle.update(`Rolling back ${planName}`)
                      : Effect.void;
                  case "Waiting":
                    return Effect.void;
                }
              }).pipe(Effect.andThen(run())),
            ),
          { successMessage: `Processed ${planName}` },
        ),
      noteTransitionWait: (holder) =>
        renderer.step(
          `Waiting: resource-conflict — workspace transition held by ${Option.match(holder, {
            onNone: () => "another operation",
            onSome: (value) => `${value.command} (pid ${value.pid})`,
          })}`,
        ),
    } satisfies ResolvePlanInteractionService;
  }),
);
