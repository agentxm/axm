/**
 * CLI implementation of the auth login presentation seam.
 *
 * Owns all sign-in wording, suggestion sets, lifecycle unit labels, and
 * machine-mode document emission for the device, loopback, and
 * publish-authorization flows.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Terminal from "effect/Terminal";
import { observeUnit } from "@agentxm/workspace-operations";

import { Prompt } from "effect/unstable/cli";

import {
  AuthInteractionAbandoned,
  AuthLoginPresenter,
  DeviceLoginPendingDocumentSchema,
  LoginDocumentSchema,
  type AuthLoginPresenterService,
  type AuthLoginProgress,
  type SessionReplacementDecision,
} from "@agentxm/registry-auth";
import { Screen } from "./screen/index.js";
import { requireInteractive } from "./prompt/index.js";
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

export const AuthLoginPresenterLive = Layer.effect(
  AuthLoginPresenter,
  Effect.gen(function* () {
    const screen = yield* Screen;
    // The prompt environment is discharged here, at the composition root that
    // owns the interaction, so the port's members keep `R = never`. A
    // composition without a terminal cannot ask, and says so.
    const promptEnvironment = Option.all({
      fileSystem: yield* Effect.serviceOption(FileSystem.FileSystem),
      path: yield* Effect.serviceOption(Path.Path),
      terminal: yield* Effect.serviceOption(Terminal.Terminal),
    }).pipe(
      Option.map((services) =>
        Layer.mergeAll(
          Layer.succeed(FileSystem.FileSystem, services.fileSystem),
          Layer.succeed(Path.Path, services.path),
          Layer.succeed(Terminal.Terminal, services.terminal),
        ),
      ),
    );
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
        Option.match(promptEnvironment, {
          onNone: () =>
            Effect.fail(
              new AuthInteractionAbandoned({ message: `Interactive prompt required: ${message}` }),
            ),
          onSome: (environment) =>
            screen.prompt(requireInteractive(Prompt.Confirm({ message }), { message })).pipe(
              Effect.map((replace): SessionReplacementDecision => (replace ? "replace" : "keep")),
              Effect.catchTag("PromptCancelled", (cancelled) =>
                Effect.fail(new AuthInteractionAbandoned({ message: cancelled.message })),
              ),
              Effect.catchTag("AppError", (error) =>
                Effect.fail(new AuthInteractionAbandoned({ message: error.detail })),
              ),
              Effect.provide(environment),
            ),
        }),
      presentStepUpChallenge: (challenge) =>
        Effect.forEach(
          stepUpChallengeView(challenge),
          (entry) => screen.note(entry.doc, { persistent: entry.persistent === true }),
          { discard: true },
        ),
    } satisfies AuthLoginPresenterService;
  }),
);
