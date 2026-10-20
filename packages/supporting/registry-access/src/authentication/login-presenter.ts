/**
 * Auth login presentation seam.
 *
 * The device and loopback sign-in flows report progress and
 * present sign-in guidance exclusively through this service. The CLI runtime
 * provides the renderer-backed implementation; wording, suggestion sets, and
 * terminal result delivery belong to the CLI after operation settlement, never to the
 * authentication capability.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ServiceMap from "effect/Context";

import type { DeviceLoginPendingResult } from "./device-login.js";
import { AuthInteractionAbandoned, type RegistryAccessFailed } from "./errors.js";

export type AuthLoginProgress =
  | { readonly _tag: "StartingDeviceAuthorization"; readonly registryHost: string }
  | { readonly _tag: "SavingCredentials"; readonly registryHost: string }
  | { readonly _tag: "CompletingSignIn"; readonly registryHost: string }
  | { readonly _tag: "CheckingRegistrySession"; readonly registryHost: string }
  | { readonly _tag: "RevokingRegistrySession"; readonly registryHost: string }
  | { readonly _tag: "ListingRegistryTokens" };

/** What a person decided about replacing a session that is still valid. */
export type SessionReplacementDecision = "replace" | "keep";

/** Why sign-in fell back to the device-code flow. */
type DeviceCodeFallbackReason = "remote-or-headless" | "loopback-bind-failed";

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
    }
  /** Browser sign-in through a loopback redirect. */
  | {
      readonly _tag: "LoopbackLogin";
      readonly registryHost: string;
      readonly authorizeUrl: string;
      readonly redirectUri: string;
      readonly expiresAtMs: number;
      readonly browserOpened: boolean;
    };

/** The link a handoff parks on: what its open key opens and its copy key copies. */
export const handoffUrl = (handoff: HumanHandoff): string => {
  switch (handoff._tag) {
    case "DeviceLogin":
      return handoff.verificationUriComplete;
    case "LoopbackLogin":
      return handoff.authorizeUrl;
  }
};

export interface AuthLoginPresenterService {
  // Guidance and prompts are fallible operations. Callers
  // preserve delivery failures and interruption instead of claiming completion
  // or treating a broken output destination as a person's decision to stop.
  /** Progress envelope for one login phase. */
  readonly withProgress: <A, E, R>(
    progress: AuthLoginProgress,
    run: () => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
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
  ) => Effect.Effect<A, E | AuthInteractionAbandoned | RegistryAccessFailed, R>;
  /** Human-path tail: sign-in is waiting for approval, with resume guidance. */
  readonly notePendingApproval: (
    result: DeviceLoginPendingResult,
  ) => Effect.Effect<void, RegistryAccessFailed>;
  readonly presentLoopbackStart: (start: {
    readonly redirectUri: string;
    readonly authorizeUrl: string;
  }) => Effect.Effect<void, RegistryAccessFailed>;
  readonly noteLoopbackBrowserOutcome: (
    opened: boolean,
  ) => Effect.Effect<void, RegistryAccessFailed>;
  readonly noteDeviceCodeReplaced: () => Effect.Effect<void, RegistryAccessFailed>;
  readonly noteBrowserSignInRestarted: () => Effect.Effect<void, RegistryAccessFailed>;
  readonly noteNewAccountDeviceSignIn: () => Effect.Effect<void, RegistryAccessFailed>;
  /** A still-valid session was found for the selected Registry. */
  readonly noteExistingSession: (handle: string) => Effect.Effect<void, RegistryAccessFailed>;
  /** Stored credentials were rejected, so a new sign-in starts. */
  readonly noteRejectedStoredCredentials: Effect.Effect<void, RegistryAccessFailed>;
  /** Sign-in fell back to the device-code flow for the carried reason. */
  readonly noteDeviceCodeFallback: (
    reason: DeviceCodeFallbackReason,
  ) => Effect.Effect<void, RegistryAccessFailed>;
  /**
   * Ask whether to replace a session that is still valid. Abandoning the
   * question fails with `AuthInteractionAbandoned`; declining returns "keep".
   */
  readonly confirmSessionReplacement: () => Effect.Effect<
    SessionReplacementDecision,
    AuthInteractionAbandoned | RegistryAccessFailed
  >;
}

export class AuthLoginPresenter extends ServiceMap.Service<
  AuthLoginPresenter,
  AuthLoginPresenterService
>()("@agentxm/registry-access/login-presenter/AuthLoginPresenter") {}

export interface AuthLoginPresenterTestState {
  readonly progress: Array<AuthLoginProgress>;
  /** Every handoff a person was shown, in the order the flows reached them. */
  readonly handoffs: Array<HumanHandoff>;
  readonly pendingApprovals: Array<DeviceLoginPendingResult>;
  readonly loopbackStarts: Array<{ readonly redirectUri: string; readonly authorizeUrl: string }>;
  readonly loopbackBrowserOutcomes: Array<boolean>;
  readonly existingSessions: Array<string>;
  readonly deviceCodeReplacements: Array<true>;
  readonly browserSignInRestarts: Array<true>;
  readonly newAccountDeviceSignIns: Array<true>;
  readonly rejectedStoredCredentials: Array<true>;
  readonly deviceCodeFallbacks: Array<DeviceCodeFallbackReason>;
  readonly sessionReplacementPrompts: Array<true>;
}

export const AuthLoginPresenterTest = (overrides?: {
  readonly confirmSessionReplacement?: AuthLoginPresenterService["confirmSessionReplacement"];
  readonly awaitHuman?: AuthLoginPresenterService["awaitHuman"];
  /** Stop every wait, as a person pressing the stop key would. */
  readonly abandonWaits?: boolean;
}) => {
  const state: AuthLoginPresenterTestState = {
    progress: [],
    handoffs: [],
    pendingApprovals: [],
    loopbackStarts: [],
    loopbackBrowserOutcomes: [],
    existingSessions: [],
    deviceCodeReplacements: [],
    browserSignInRestarts: [],
    newAccountDeviceSignIns: [],
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
    awaitHuman: <A, E, R>(handoff: HumanHandoff, awaited: Effect.Effect<A, E, R>) =>
      Effect.suspend(
        (): Effect.Effect<A, E | AuthInteractionAbandoned | RegistryAccessFailed, R> => {
          state.handoffs.push(handoff);
          if (overrides?.awaitHuman !== undefined) return overrides.awaitHuman(handoff, awaited);
          return overrides?.abandonWaits === true
            ? Effect.fail(new AuthInteractionAbandoned({ message: "Stopped waiting." }))
            : awaited;
        },
      ),
    notePendingApproval: (result) =>
      Effect.sync(() => {
        state.pendingApprovals.push(result);
      }),
    presentLoopbackStart: (start) =>
      Effect.sync(() => {
        state.loopbackStarts.push(start);
      }),
    noteLoopbackBrowserOutcome: (opened) =>
      Effect.sync(() => {
        state.loopbackBrowserOutcomes.push(opened);
      }),
    noteDeviceCodeReplaced: () =>
      Effect.sync(() => {
        state.deviceCodeReplacements.push(true);
      }),
    noteBrowserSignInRestarted: () =>
      Effect.sync(() => {
        state.browserSignInRestarts.push(true);
      }),
    noteNewAccountDeviceSignIn: () =>
      Effect.sync(() => {
        state.newAccountDeviceSignIns.push(true);
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
