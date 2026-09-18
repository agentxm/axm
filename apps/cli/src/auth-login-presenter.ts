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
  DeviceLoginPendingDocumentSchema,
  LoginDocumentSchema,
  type AuthLoginPresenterService,
  type AuthLoginProgress,
  type SessionReplacementDecision,
} from "@agentxm/registry-access/authentication";
import { Screen, type ConfirmAsk } from "./screen/index.js";
import {
  authProgressLabel,
  authProgressUnitId,
  deviceCodeFallbackNote,
  deviceFlowView,
  existingSessionNote,
  loginSuccessDoc,
  loginSuccessSuggestions,
  loopbackBrowserOutcomeView,
  loopbackStartView,
  pendingApprovalDoc,
  pendingDeviceSuggestions,
  publishReviewDoc,
  rejectedStoredCredentialsNote,
  stepUpChallengeView,
} from "./root/auth/view.js";

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
      presentDeviceFlow: (presentation) =>
        Effect.gen(function* () {
          for (const entry of deviceFlowView(presentation)) {
            yield* screen.note(entry.doc, { persistent: entry.persistent === true });
          }
        }),
      notePendingApproval: (result) => screen.result(pendingApprovalDoc(result)),
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
      presentLoopbackStart: (start) =>
        Effect.forEach(
          loopbackStartView(start),
          (entry) => screen.note(entry.doc, { persistent: entry.persistent === true }),
          { discard: true },
        ),
      noteLoopbackBrowserOutcome: (opened) => {
        const entry = loopbackBrowserOutcomeView(opened);
        return screen.note(entry.doc, { persistent: entry.persistent === true });
      },
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
      presentStepUpChallenge: (challenge) =>
        Effect.forEach(
          stepUpChallengeView(challenge),
          (entry) => screen.note(entry.doc, { persistent: entry.persistent === true }),
          { discard: true },
        ),
    } satisfies AuthLoginPresenterService;
  }),
);
