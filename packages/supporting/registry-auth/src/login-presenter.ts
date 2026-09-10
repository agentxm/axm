/**
 * Auth login presentation seam.
 *
 * The device, loopback, and publish-authorization flows report progress and
 * present sign-in guidance exclusively through this service. The CLI runtime
 * provides the renderer-backed implementation; wording, suggestion sets, and
 * machine-mode document emission belong to that implementation, never to the
 * auth feature.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ServiceMap from "effect/Context";

import type { DeviceLoginPendingResult } from "./device-login.js";
import type { AuthInteractionAbandoned } from "./errors.js";
import type { LoginResult } from "./login-output.js";

export type AuthLoginProgress =
  | { readonly _tag: "StartingDeviceAuthorization"; readonly registryHost: string }
  | { readonly _tag: "WaitingForDeviceAuthorization"; readonly registryHost: string }
  | { readonly _tag: "SavingCredentials"; readonly registryHost: string }
  | {
      readonly _tag: "WaitingForLoopbackAuthorization";
      readonly registryHost: string;
      readonly timeoutMinutes: number;
    }
  | { readonly _tag: "CompletingSignIn"; readonly registryHost: string }
  | { readonly _tag: "CheckingRegistrySession"; readonly registryHost: string }
  | { readonly _tag: "RevokingRegistrySession"; readonly registryHost: string }
  | { readonly _tag: "ListingRegistryTokens" }
  /** A Registry write that the Registry may challenge for human verification. */
  | { readonly _tag: "RunningVerifiedWrite"; readonly operation: string }
  /** The bounded wait while a person completes verification. */
  | { readonly _tag: "WaitingForHumanVerification"; readonly operation: string }
  /** The one retry of the challenged write, after verification. */
  | { readonly _tag: "RetryingVerifiedWrite"; readonly operation: string };

/** What a person decided about replacing a session that is still valid. */
export type SessionReplacementDecision = "replace" | "keep";

/** Why sign-in fell back to the device-code flow. */
export type DeviceCodeFallbackReason = "remote-or-headless" | "loopback-bind-failed";

/** One step-up challenge, as a person needs to see it. */
export interface StepUpChallengePresentation {
  readonly action: string;
  readonly target: string;
  readonly verificationUrl: string;
  readonly expiresAt: string;
  readonly browserOpened: boolean;
}

export interface DeviceFlowPresentation {
  readonly verificationUri: string;
  readonly verificationUriComplete: string;
  readonly userCode: string;
  readonly expiresInSeconds: number;
  readonly browserOpened: boolean;
  readonly copiedToClipboard: boolean;
}

export interface AuthLoginPresenterService {
  /** Progress envelope for one login phase. */
  readonly withProgress: <A, E, R>(
    progress: AuthLoginProgress,
    run: () => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
  /**
   * Machine-mode pending-document emission. Returns true when machine output
   * consumed the result — the caller must then skip browser/clipboard side
   * effects and human presentation.
   */
  readonly tryEmitPendingDeviceLogin: (result: DeviceLoginPendingResult) => Effect.Effect<boolean>;
  /** Human presentation of the device flow after side effects have settled. */
  readonly presentDeviceFlow: (presentation: DeviceFlowPresentation) => Effect.Effect<void>;
  /** Human-path tail: sign-in is waiting for approval, with resume guidance. */
  readonly notePendingApproval: (result: DeviceLoginPendingResult) => Effect.Effect<void>;
  /** Machine login-document emission with human success fallback. */
  readonly emitLoginSuccess: (result: LoginResult) => Effect.Effect<void>;
  readonly presentLoopbackStart: (start: {
    readonly redirectUri: string;
    readonly authorizeUrl: string;
  }) => Effect.Effect<void>;
  readonly noteLoopbackBrowserOutcome: (opened: boolean) => Effect.Effect<void>;
  readonly notePublishReview: (review: {
    readonly browserOpened: boolean;
    readonly candidateCount: number;
    readonly authorizationUrl: string;
  }) => Effect.Effect<void>;
  /** A still-valid session was found for the selected Registry. */
  readonly noteExistingSession: (handle: string) => Effect.Effect<void>;
  /** Stored credentials were rejected, so a new sign-in starts. */
  readonly noteRejectedStoredCredentials: Effect.Effect<void>;
  /** Sign-in fell back to the device-code flow for the carried reason. */
  readonly noteDeviceCodeFallback: (reason: DeviceCodeFallbackReason) => Effect.Effect<void>;
  /**
   * Ask whether to replace a session that is still valid. Abandoning the
   * question fails with `AuthInteractionAbandoned`; declining returns "keep".
   */
  readonly confirmSessionReplacement: (
    message: string,
  ) => Effect.Effect<SessionReplacementDecision, AuthInteractionAbandoned>;
  /** Guidance for one pending step-up verification. */
  readonly presentStepUpChallenge: (challenge: StepUpChallengePresentation) => Effect.Effect<void>;
}

export class AuthLoginPresenter extends ServiceMap.Service<
  AuthLoginPresenter,
  AuthLoginPresenterService
>()("@agentxm/registry-auth/login-presenter/AuthLoginPresenter") {}

export interface AuthLoginPresenterTestState {
  readonly progress: Array<AuthLoginProgress>;
  readonly pendingEmissions: Array<DeviceLoginPendingResult>;
  readonly deviceFlowPresentations: Array<DeviceFlowPresentation>;
  readonly pendingApprovals: Array<DeviceLoginPendingResult>;
  readonly loginSuccesses: Array<LoginResult>;
  readonly loopbackStarts: Array<{ readonly redirectUri: string; readonly authorizeUrl: string }>;
  readonly loopbackBrowserOutcomes: Array<boolean>;
  readonly publishReviews: Array<{
    readonly browserOpened: boolean;
    readonly candidateCount: number;
    readonly authorizationUrl: string;
  }>;
  readonly existingSessions: Array<string>;
  readonly rejectedStoredCredentials: Array<true>;
  readonly deviceCodeFallbacks: Array<DeviceCodeFallbackReason>;
  readonly sessionReplacementPrompts: Array<string>;
  readonly stepUpChallenges: Array<StepUpChallengePresentation>;
}

export const AuthLoginPresenterTest = (overrides?: {
  readonly tryEmitPendingDeviceLogin?: (result: DeviceLoginPendingResult) => Effect.Effect<boolean>;
  readonly confirmSessionReplacement?: (
    message: string,
  ) => Effect.Effect<SessionReplacementDecision, AuthInteractionAbandoned>;
}) => {
  const state: AuthLoginPresenterTestState = {
    progress: [],
    pendingEmissions: [],
    deviceFlowPresentations: [],
    pendingApprovals: [],
    loginSuccesses: [],
    loopbackStarts: [],
    loopbackBrowserOutcomes: [],
    publishReviews: [],
    existingSessions: [],
    rejectedStoredCredentials: [],
    deviceCodeFallbacks: [],
    sessionReplacementPrompts: [],
    stepUpChallenges: [],
  };

  const layer = Layer.succeed(AuthLoginPresenter, {
    withProgress: (progress, run) =>
      Effect.suspend(() => {
        state.progress.push(progress);
        return run();
      }),
    tryEmitPendingDeviceLogin: (result) =>
      Effect.gen(function* () {
        state.pendingEmissions.push(result);
        return yield* overrides?.tryEmitPendingDeviceLogin?.(result) ?? Effect.succeed(false);
      }),
    presentDeviceFlow: (presentation) =>
      Effect.sync(() => {
        state.deviceFlowPresentations.push(presentation);
      }),
    notePendingApproval: (result) =>
      Effect.sync(() => {
        state.pendingApprovals.push(result);
      }),
    emitLoginSuccess: (result) =>
      Effect.sync(() => {
        state.loginSuccesses.push(result);
      }),
    presentLoopbackStart: (start) =>
      Effect.sync(() => {
        state.loopbackStarts.push(start);
      }),
    noteLoopbackBrowserOutcome: (opened) =>
      Effect.sync(() => {
        state.loopbackBrowserOutcomes.push(opened);
      }),
    notePublishReview: (review) =>
      Effect.sync(() => {
        state.publishReviews.push(review);
      }),
    noteExistingSession: (handle) =>
      Effect.sync(() => {
        state.existingSessions.push(handle);
      }),
    noteRejectedStoredCredentials: Effect.sync(() => {
      state.rejectedStoredCredentials.push(true);
    }),
    noteDeviceCodeFallback: (reason) =>
      Effect.sync(() => {
        state.deviceCodeFallbacks.push(reason);
      }),
    confirmSessionReplacement: (message) =>
      Effect.gen(function* () {
        state.sessionReplacementPrompts.push(message);
        return yield* overrides?.confirmSessionReplacement?.(message) ??
          Effect.succeed<SessionReplacementDecision>("replace");
      }),
    presentStepUpChallenge: (challenge) =>
      Effect.sync(() => {
        state.stepUpChallenges.push(challenge);
      }),
  } satisfies AuthLoginPresenterService);

  return { layer, state };
};
