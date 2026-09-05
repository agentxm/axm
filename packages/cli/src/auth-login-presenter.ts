/**
 * CLI implementation of the auth login presentation seam.
 *
 * Owns all sign-in wording, suggestion sets, lifecycle unit labels, and
 * machine-mode document emission for the device, loopback, and
 * publish-authorization flows.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { observeUnit } from "@agentxm/workspace-operations";

import {
  AuthLoginPresenter,
  DeviceLoginPendingDocumentSchema,
  LoginDocumentSchema,
  type AuthLoginPresenterService,
  type AuthLoginProgress,
} from "@agentxm/registry-auth";
import { Screen } from "./screen/index.js";
import {
  authProgressLabel,
  deviceFlowView,
  loginSuccessDoc,
  loginSuccessSuggestions,
  loopbackBrowserOutcomeView,
  loopbackStartView,
  pendingApprovalDoc,
  pendingDeviceSuggestions,
  publishReviewDoc,
} from "./root/auth/view.js";

export const AuthLoginPresenterLive = Layer.effect(
  AuthLoginPresenter,
  Effect.gen(function* () {
    const screen = yield* Screen;
    return {
      withProgress: <A, E, R>(progress: AuthLoginProgress, run: () => Effect.Effect<A, E, R>) =>
        observeUnit({ id: progress._tag, label: authProgressLabel(progress) }, run()),
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
    } satisfies AuthLoginPresenterService;
  }),
);
