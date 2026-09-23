/**
 * CLI implementation of the auth login presentation seam.
 *
 * Owns all sign-in wording, suggestion sets, lifecycle unit labels, and
 * machine-mode document emission for the device and loopback sign-in flows.
 */

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

const outputFailure = (cause: OutputWriteFailed) =>
  new RegistryAccessFailed({
    category: "internal",
    detail: "The authentication output could not be delivered.",
    cause,
  });

export const AuthLoginPresenterLive = Layer.effect(
  AuthLoginPresenter,
  Effect.gen(function* () {
    const screen = yield* Screen;
    const required = <A, E, R>(effect: Effect.Effect<A, E | OutputWriteFailed, R>) =>
      effect.pipe(
        Effect.catchIf(
          (error): error is OutputWriteFailed => error instanceof OutputWriteFailed,
          (cause) => Effect.fail(outputFailure(cause)),
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
      confirmSessionReplacement: () =>
        screen.ask(sessionReplacementAsk).pipe(
          Effect.catchTag("QuestionCancelled", (cancelled) =>
            Effect.fail(new AuthInteractionAbandoned({ message: cancelled.message })),
          ),
          Effect.catchTag("AppError", (error) =>
            Effect.fail(
              new RegistryAccessFailed({ category: "usage", detail: error.detail, cause: error }),
            ),
          ),
          required,
        ),
    } satisfies AuthLoginPresenterService;
  }),
);
