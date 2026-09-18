/**
 * CLI implementation of the auth login presentation seam.
 *
 * Owns all sign-in wording, suggestion sets, lifecycle unit labels, and
 * machine-mode document emission for the device, loopback, and
 * publish-authorization flows.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { observeUnit } from "@agentxm/workspace/transitions/planning";

import {
  AuthInteractionAbandoned,
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
import { Screen, WaitAbandoned, type ConfirmAsk } from "./screen/index.js";
import {
  authProgressLabel,
  authProgressUnitId,
  deviceCodeFallbackNote,
  existingSessionNote,
  handoffCopyValue,
  handoffWaitView,
  loginSuccessDoc,
  loginSuccessSuggestions,
  pendingApprovalDoc,
  pendingDeviceSuggestions,
  pendingHandoffBrief,
  publishReviewDoc,
  rejectedStoredCredentialsNote,
} from "./root/auth/view.js";

/** The one failure a wait adds to whatever the awaited effect can already fail with. */
const isWaitAbandoned = (error: unknown): error is WaitAbandoned => error instanceof WaitAbandoned;

/** Replacing a live session is the risk here, so the default is to keep it. */
const sessionReplacementAsk = (message: string): ConfirmAsk<SessionReplacementDecision> => ({
  _tag: "Confirm",
  question: message,
  label: "Replace session",
  choices: [
    { key: "n", word: "no", value: "keep" },
    { key: "y", word: "yes", value: "replace" },
  ],
});

export const AuthLoginPresenterLive = Layer.effect(
  AuthLoginPresenter,
  Effect.gen(function* () {
    const screen = yield* Screen;
    return {
      withProgress: <A, E, R>(progress: AuthLoginProgress, run: () => Effect.Effect<A, E, R>) =>
        observeUnit(
          { id: authProgressUnitId(progress), label: authProgressLabel(progress) },
          run(),
        ),
      tryEmitPendingDeviceLogin: (result) =>
        Effect.gen(function* () {
          return yield* screen.document({ result }, DeviceLoginPendingDocumentSchema, {
            suggestions: pendingDeviceSuggestions(result),
          });
        }),
      awaitHuman: <A, E, R>(
        handoff: HumanHandoff,
        awaited: Effect.Effect<A, E, R>,
      ): Effect.Effect<A, E | AuthInteractionAbandoned, R | DeviceLoginInteraction> =>
        Effect.gen(function* () {
          const interaction = yield* DeviceLoginInteraction;
          const view = handoffWaitView(handoff);
          // The wait is the unit: the ledger row it names reads as paused for
          // as long as a person has not finished elsewhere.
          return yield* screen
            .wait(view, observeUnit({ id: view.subject, label: view.label }, awaited), {
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
        }),
      // The guidance is an aside on stderr; the outcome is the result, so a
      // pipe carries the one and a person reads both.
      notePendingApproval: (result) =>
        screen
          .note(pendingHandoffBrief(result), { persistent: true })
          .pipe(Effect.andThen(screen.result(pendingApprovalDoc(result)))),
      emitLoginSuccess: (result) =>
        Effect.gen(function* () {
          if (
            yield* screen.document({ result }, LoginDocumentSchema, {
              suggestions: loginSuccessSuggestions,
            })
          ) {
            return;
          }
          yield* screen.result(loginSuccessDoc(result));
        }),
      notePublishReview: (review) => screen.note(publishReviewDoc(review)),
      noteExistingSession: (handle) => screen.note(existingSessionNote(handle).doc),
      noteRejectedStoredCredentials: screen.note(rejectedStoredCredentialsNote.doc),
      noteDeviceCodeFallback: (reason) => {
        const entry = deviceCodeFallbackNote(reason);
        return screen.note(entry.doc, { persistent: entry.persistent === true });
      },
      confirmSessionReplacement: (message) =>
        screen.ask(sessionReplacementAsk(message), { message }).pipe(
          Effect.catchTag("PromptCancelled", (cancelled) =>
            Effect.fail(new AuthInteractionAbandoned({ message: cancelled.message })),
          ),
          Effect.catchTag("AppError", (error) =>
            Effect.fail(new AuthInteractionAbandoned({ message: error.detail })),
          ),
        ),
    } satisfies AuthLoginPresenterService;
  }),
);
