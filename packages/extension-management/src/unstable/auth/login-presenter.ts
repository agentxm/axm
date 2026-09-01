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
  | { readonly _tag: "CompletingSignIn"; readonly registryHost: string };

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
}

export class AuthLoginPresenter extends ServiceMap.Service<
  AuthLoginPresenter,
  AuthLoginPresenterService
>()("@agentxm/extension-management/unstable/auth/login-presenter/AuthLoginPresenter") {}

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
}

export const AuthLoginPresenterTest = (overrides?: {
  readonly tryEmitPendingDeviceLogin?: (result: DeviceLoginPendingResult) => Effect.Effect<boolean>;
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
  } satisfies AuthLoginPresenterService);

  return { layer, state };
};
