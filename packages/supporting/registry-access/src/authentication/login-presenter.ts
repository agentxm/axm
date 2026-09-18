/**
 * Auth login presentation seam.
 *
 * The device and loopback sign-in flows report progress and
 * present sign-in guidance exclusively through this service. The CLI runtime
 * provides the renderer-backed implementation; wording, suggestion sets, and
 * machine-mode document emission belong to that implementation, never to the
 * authentication capability.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ServiceMap from "effect/Context";

import type { DeviceLoginPendingResult } from "./device-login.js";
import { AuthInteractionAbandoned } from "./errors.js";
import type { LoginResult } from "./login-output.js";

export type AuthLoginProgress =
  | { readonly _tag: "StartingDeviceAuthorization"; readonly registryHost: string }
  | { readonly _tag: "SavingCredentials"; readonly registryHost: string }
  | { readonly _tag: "CompletingSignIn"; readonly registryHost: string }
  | { readonly _tag: "CheckingRegistrySession"; readonly registryHost: string }
  | { readonly _tag: "RevokingRegistrySession"; readonly registryHost: string }
  | { readonly _tag: "ListingRegistryTokens" }
  /** A Registry write that the Registry may challenge for human verification. */
  | { readonly _tag: "RunningVerifiedWrite"; readonly operation: string }
  /** The one retry of the challenged write, after verification. */
  | { readonly _tag: "RetryingVerifiedWrite"; readonly operation: string };

/** What a person decided about replacing a session that is still valid. */
export type SessionReplacementDecision = "replace" | "keep";

/** Why sign-in fell back to the device-code flow. */
export type DeviceCodeFallbackReason = "remote-or-headless" | "loopback-bind-failed";

/**
 * One handoff to a person, as the terminal must show it while the command is
 * parked. Every form carries the same four facts — where the person acts, what
 * they act on, when it expires, and whether a browser was already opened — so
 * one wait renders all of them and no flow invents its own presentation.
 */
export type HumanHandoff =
  /** Device-code sign-in: a one-time code entered on a verification page. */
  | {
      readonly _tag: "DeviceLogin";
      readonly registryHost: string;
      /** The page that carries the code already; what `o` opens and `c` copies. */
      readonly verificationUriComplete: string;
      /** The clean page a person enters the code on by hand. */
      readonly verificationUri: string;
      readonly userCode: string;
      readonly expiresAtMs: number;
      readonly browserOpened: boolean;
      readonly copiedToClipboard: boolean;
    }
  /** Browser sign-in through a loopback redirect. */
  | {
      readonly _tag: "LoopbackLogin";
      readonly registryHost: string;
      readonly authorizeUrl: string;
      readonly redirectUri: string;
      readonly expiresAtMs: number;
      readonly browserOpened: boolean;
    }
  /** Human verification of one challenged Registry write. */
  | {
      readonly _tag: "StepUp";
      readonly action: string;
      readonly target: string;
      readonly verificationUrl: string;
      readonly expiresAtMs: number;
    }
  /** Review of the exact publication set before Registry capabilities are issued. */
  | {
      readonly _tag: "PublishAuthorization";
      readonly authorizationUrl: string;
      readonly candidateCount: number;
      readonly expiresAtMs: number;
    };

/** The link a handoff parks on: what its reopen key opens; device login copies its code. */
export const handoffUrl = (handoff: HumanHandoff): string => {
  switch (handoff._tag) {
    case "DeviceLogin":
      return handoff.verificationUriComplete;
    case "LoopbackLogin":
      return handoff.authorizeUrl;
    case "StepUp":
      return handoff.verificationUrl;
    case "PublishAuthorization":
      return handoff.authorizationUrl;
  }
};

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
  /**
   * Park the terminal while a person completes the handoff elsewhere, and
   * answer with what `awaited` settled on. The application owns how the wait
   * reads and which keys it offers; abandoning it fails with
   * `AuthInteractionAbandoned`, and the caller ends with its own pending
   * outcome rather than a failure of the request it parked on.
   */
  readonly awaitHuman: <A, E, R>(
    handoff: HumanHandoff,
    awaited: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | AuthInteractionAbandoned, R>;
  /** Human-path tail: sign-in is waiting for approval, with resume guidance. */
  readonly notePendingApproval: (result: DeviceLoginPendingResult) => Effect.Effect<void>;
  /** Machine login-document emission with human success fallback. */
  readonly emitLoginSuccess: (result: LoginResult) => Effect.Effect<void>;
  readonly presentLoopbackStart: (start: {
    readonly redirectUri: string;
    readonly authorizeUrl: string;
  }) => Effect.Effect<void>;
  readonly noteLoopbackBrowserOutcome: (opened: boolean) => Effect.Effect<void>;
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
  readonly confirmSessionReplacement: () => Effect.Effect<
    SessionReplacementDecision,
    AuthInteractionAbandoned
  >;
}

export class AuthLoginPresenter extends ServiceMap.Service<
  AuthLoginPresenter,
  AuthLoginPresenterService
>()("@agentxm/registry-access/login-presenter/AuthLoginPresenter") {}

export interface AuthLoginPresenterTestState {
  readonly progress: Array<AuthLoginProgress>;
  readonly pendingEmissions: Array<DeviceLoginPendingResult>;
  /** Every handoff a person was shown, in the order the flows reached them. */
  readonly handoffs: Array<HumanHandoff>;
  readonly pendingApprovals: Array<DeviceLoginPendingResult>;
  readonly loginSuccesses: Array<LoginResult>;
  readonly loopbackStarts: Array<{ readonly redirectUri: string; readonly authorizeUrl: string }>;
  readonly loopbackBrowserOutcomes: Array<boolean>;
  readonly existingSessions: Array<string>;
  readonly rejectedStoredCredentials: Array<true>;
  readonly deviceCodeFallbacks: Array<DeviceCodeFallbackReason>;
  readonly sessionReplacementPrompts: Array<true>;
}

export const AuthLoginPresenterTest = (overrides?: {
  readonly tryEmitPendingDeviceLogin?: (result: DeviceLoginPendingResult) => Effect.Effect<boolean>;
  readonly confirmSessionReplacement?: () => Effect.Effect<
    SessionReplacementDecision,
    AuthInteractionAbandoned
  >;
  /** Stop every wait, as a person pressing the stop key would. */
  readonly abandonWaits?: boolean;
}) => {
  const state: AuthLoginPresenterTestState = {
    progress: [],
    pendingEmissions: [],
    handoffs: [],
    pendingApprovals: [],
    loginSuccesses: [],
    loopbackStarts: [],
    loopbackBrowserOutcomes: [],
    existingSessions: [],
    rejectedStoredCredentials: [],
    deviceCodeFallbacks: [],
    sessionReplacementPrompts: [],
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
    awaitHuman: <A, E, R>(handoff: HumanHandoff, awaited: Effect.Effect<A, E, R>) =>
      Effect.suspend((): Effect.Effect<A, E | AuthInteractionAbandoned, R> => {
        state.handoffs.push(handoff);
        return overrides?.abandonWaits === true
          ? Effect.fail(new AuthInteractionAbandoned({ message: "Stopped waiting." }))
          : awaited;
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
    confirmSessionReplacement: () =>
      Effect.gen(function* () {
        state.sessionReplacementPrompts.push(true);
        return yield* overrides?.confirmSessionReplacement?.() ??
          Effect.succeed<SessionReplacementDecision>("replace");
      }),
  } satisfies AuthLoginPresenterService);

  return { layer, state };
};
