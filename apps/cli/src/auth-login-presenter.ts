/**
 * CLI implementation of the auth login presentation seam.
 *
 * Owns all sign-in wording, suggestion sets, lifecycle unit labels, and
 * machine-mode document emission for the device and loopback sign-in flows.
 */

import { ConfigError } from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { observeChildUnit, observeUnit } from "@agentxm/workspace/transitions/planning";

import {
  AuthInteractionAbandoned,
  RegistryAccessFailed,
  AuthLoginPresenter,
  DeviceLoginInteraction,
  DeviceLoginPendingDocumentSchema,
  LoginDocumentSchema,
  handoffUrl,
  type AuthLoginPresenterService,
  type AuthLoginProgress,
  type HumanHandoff,
  type SessionReplacementDecision,
} from "@agentxm/registry-access/authentication";
import {
  emitResult,
  Screen,
  WaitAbandoned,
  OutputWriteFailed,
  askFailureFields,
  type AskFailure,
  type AskFailureWording,
  type ConfirmAsk,
} from "./screen/index.js";
import {
  authProgressLabel,
  authProgressUnitId,
  deviceCodeFallbackNote,
  existingSessionNote,
  handoffCopyValue,
  handoffWaitView,
  loginSuccessDoc,
  loginSuccessSuggestions,
  loopbackBrowserOutcomeView,
  loopbackStartView,
  pendingApprovalDoc,
  pendingDeviceSuggestions,
  pendingHandoffBrief,
  rejectedStoredCredentialsNote,
} from "./root/auth/view.js";

/** The one failure a wait adds to whatever the awaited effect can already fail with. */
const isWaitAbandoned = (error: unknown): error is WaitAbandoned => error instanceof WaitAbandoned;

/** Replacing a live session is the risk here, so the default is to keep it. */
const sessionReplacementAsk: ConfirmAsk<SessionReplacementDecision> = {
  _tag: "Confirm",
  question: "Log in with a different account?",
  label: "Replace session",
  choices: [
    { key: "n", word: "no", value: "keep" },
    { key: "y", word: "yes", value: "replace" },
  ],
};

const authWording: AskFailureWording = {
  configuration: "Authentication interaction configuration could not be read.",
  output: "The authentication output could not be delivered.",
};

/** A question or an output that did not reach the person, as the capability reports it. */
const deliveryFailure = (cause: AskFailure) =>
  new RegistryAccessFailed(askFailureFields(cause, authWording));

export const AuthLoginPresenterLive = Layer.effect(
  AuthLoginPresenter,
  Effect.gen(function* () {
    const screen = yield* Screen;
    const required = <A, E, R>(effect: Effect.Effect<A, E | OutputWriteFailed | ConfigError, R>) =>
      effect.pipe(
        Effect.catchIf(
          (error): error is OutputWriteFailed | ConfigError =>
            error instanceof OutputWriteFailed || error instanceof ConfigError,
          (cause) => Effect.fail(deliveryFailure(cause)),
        ),
      );
    const interaction = yield* DeviceLoginInteraction;
    return {
      withProgress: <A, E, R>(progress: AuthLoginProgress, run: () => Effect.Effect<A, E, R>) =>
        observeUnit(
          { id: authProgressUnitId(progress), label: authProgressLabel(progress) },
          run(),
        ),
      tryEmitPendingDeviceLogin: (result) =>
        Effect.gen(function* () {
          return yield* required(
            screen.document({ result }, DeviceLoginPendingDocumentSchema, {
              suggestions: pendingDeviceSuggestions(result),
            }),
          );
        }),
      awaitHuman: <A, E, R>(
        handoff: HumanHandoff,
        awaited: Effect.Effect<A, E, R>,
      ): Effect.Effect<A, E | AuthInteractionAbandoned | RegistryAccessFailed, R> =>
        Effect.gen(function* () {
          const view = handoffWaitView(handoff);
          // The wait is the unit: its lifecycle remains paused for
          // as long as a person has not finished elsewhere.
          return yield* screen
            .wait(view, observeChildUnit({ id: view.subject, label: view.label }, awaited), {
              open: interaction.openBrowser(handoffUrl(handoff)),
              copy: interaction.copyToClipboard(handoffCopyValue(handoff)),
            })
            .pipe(
              // Stopping a wait is the capability's own abandonment, so nothing
              // below this port ever sees a terminal concept.
              Effect.catchIf(isWaitAbandoned, (stopped) =>
                Effect.fail(new AuthInteractionAbandoned({ message: stopped.message })),
              ),
            );
        }).pipe(required),
      // The guidance is an aside on stderr; the outcome is the result, so a
      // pipe carries the one and a person reads both.
      notePendingApproval: (result) =>
        screen
          .instruction(pendingHandoffBrief(result))
          .pipe(Effect.andThen(screen.result(pendingApprovalDoc(result))), required),
      emitLoginSuccess: (result) =>
        emitResult({ result }, LoginDocumentSchema, () => loginSuccessDoc(result), {
          suggestions: loginSuccessSuggestions,
        }).pipe(Effect.provideService(Screen, screen), required),
      presentLoopbackStart: (start) =>
        Effect.forEach(
          loopbackStartView(start),
          (entry) =>
            entry.instruction === true ? screen.instruction(entry.doc) : screen.note(entry.doc),
          { discard: true },
        ).pipe(required),
      noteLoopbackBrowserOutcome: (opened) => {
        const entry = loopbackBrowserOutcomeView(opened);
        return required(
          entry.instruction === true ? screen.instruction(entry.doc) : screen.note(entry.doc),
        );
      },
      noteExistingSession: (handle) => required(screen.note(existingSessionNote(handle).doc)),
      noteRejectedStoredCredentials: required(screen.note(rejectedStoredCredentialsNote.doc)),
      noteDeviceCodeFallback: (reason) => {
        const entry = deviceCodeFallbackNote(reason);
        return required(
          entry.instruction === true ? screen.instruction(entry.doc) : screen.note(entry.doc),
        );
      },
      // A cancellation is the person's own abandonment, never a failure.
      confirmSessionReplacement: () =>
        screen
          .ask(sessionReplacementAsk)
          .pipe(
            Effect.mapError((error) =>
              error._tag === "QuestionCancelled"
                ? new AuthInteractionAbandoned({ message: error.message })
                : deliveryFailure(error),
            ),
          ),
    } satisfies AuthLoginPresenterService;
  }),
);
