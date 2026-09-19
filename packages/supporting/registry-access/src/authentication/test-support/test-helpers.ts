/**
 * Shared fixtures and port composition for the registry-access specifications.
 *
 * Test support only — excluded from the package build and never part of the
 * public API. Every port here is a deterministic in-memory Layer the package
 * already publishes under `./testing`; nothing reaches a real keychain, a
 * real browser, the network, or `process.env`.
 */

import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions/handle";
import { RegistryProblem } from "@agentxm/registry-client";

import {
  AuthClientTest,
  TokenExchangeTest,
  type AuthClientService,
  type TokenExchangeService,
} from "../auth-client.js";
import {
  CredentialStore,
  CredentialStoreSessionLive,
  CredentialStoreTest,
} from "../../credentials/credential-store.js";
import { DeviceLoginInteractionTest } from "../device-login.js";
import { RegistryAccessFailed, StepUpRequired, type StepUpRequest } from "../errors.js";
import { AuthEnvironment } from "../../adapters/environment.js";
import { AuthLoginInteractionTest } from "../../adapters/login-interaction.js";
import { AuthLoginPresenterTest } from "../login-presenter.js";
import type { LoginRequest } from "../login.js";
import {
  PendingDeviceLoginStoreTest,
  type PendingDeviceLogin,
} from "../pending-device-login-store.js";
import type { CredentialFile } from "../../credentials/schema.js";

/** The category a typed auth failure carries, or undefined for any other failure. */
export const authFailureCategory = (failure: unknown): string | undefined =>
  failure instanceof RegistryAccessFailed ? failure.category : undefined;

/** The detail a typed auth failure carries, or undefined for any other failure. */
export const authFailureDetail = (failure: unknown): string | undefined =>
  failure instanceof RegistryAccessFailed ? failure.detail : undefined;

export const authRegistry = "https://registry.example.test";
export const otherAuthRegistry = "https://other.example.test";
export const authRegistryHost = "registry.example.test";
export const authHandle = normalizeHandle("@alice");
export const authExpiry = DateTime.makeUnsafe("2099-01-01T00:00:00.000Z");

export const storedAuthCredentials = {
  access_token: "fixture-stored-access",
  refresh_token: "fixture-stored-refresh",
  expires_at: authExpiry,
  active: true,
};

/** A saved session for the selected Registry and for one other Registry. */
export const authCredentialFile: CredentialFile = {
  version: 1,
  registries: {
    [authRegistry]: { accounts: { [authHandle]: storedAuthCredentials } },
    [otherAuthRegistry]: {
      accounts: {
        [authHandle]: { ...storedAuthCredentials, access_token: "fixture-other-access" },
      },
    },
  },
};

export interface AuthPortsOptions {
  readonly credentials?: CredentialFile;
  readonly allowsPersistedCredentials?: boolean;
  /** Observe a backing-store read after its snapshot is captured. */
  readonly afterCredentialRead?: (registryUrl: string) => Effect.Effect<void>;
  readonly pending?: PendingDeviceLogin;
  readonly auth?: Partial<AuthClientService>;
  /** The token endpoints a stored session is renewed and revoked through. */
  readonly exchange?: Partial<TokenExchangeService>;
  /**
   * The environment auth policy reads. Defaults to an empty environment, so
   * no specification observes the developer's own `AXM_TOKEN`.
   */
  readonly environment?: Record<string, string>;
  readonly presenter?: Parameters<typeof AuthLoginPresenterTest>[0];
}

/**
 * Compose every registry-access port a sign-in, token, or identity example
 * needs, and expose what each port recorded.
 */
export const makeAuthPorts = (options: AuthPortsOptions = {}) => {
  const deviceAuthorizations: Array<string> = [];
  const polledCodes: Array<string> = [];
  const presenter = AuthLoginPresenterTest(options.presenter);
  const interaction = AuthLoginInteractionTest();
  const deviceInteraction = DeviceLoginInteractionTest();

  const auth = AuthClientTest({
    initiateDeviceFlow: () =>
      Effect.sync(() => {
        const code = `fixture-device-secret-${deviceAuthorizations.length + 1}`;
        deviceAuthorizations.push(code);
        return {
          device_code: code,
          user_code: "ABCD-1234",
          verification_uri: "https://identity.example.test/device",
          verification_uri_complete: "https://identity.example.test/device?user_code=ABCD-1234",
          interval: 1,
          expires_in: 60,
        };
      }),
    pollDeviceToken: (code) =>
      Effect.sync(() => {
        polledCodes.push(code);
        return {
          access_token: "fixture-new-access",
          refresh_token: "fixture-new-refresh",
          expires_at: authExpiry,
        };
      }),
    getMe: () =>
      Effect.succeed({
        userHandle: authHandle,
        tokenType: "session",
        authority: "account" as const,
        permissions: null,
        resourceRestrictions: null,
        expiresAt: authExpiry,
        approvedAt: null,
      }),
    ...options.auth,
  });

  const credentialStore = Layer.effect(
    CredentialStore,
    Effect.gen(function* () {
      const store = yield* CredentialStore;
      return {
        ...store,
        load: (registryUrl: string) =>
          store
            .load(registryUrl)
            .pipe(Effect.tap(() => options.afterCredentialRead?.(registryUrl) ?? Effect.void)),
      };
    }),
  ).pipe(
    Layer.provide(
      CredentialStoreTest(
        "restricted-file",
        options.credentials,
        options.allowsPersistedCredentials,
      ),
    ),
  );

  const layer = Layer.mergeAll(
    presenter.layer,
    interaction.layer,
    deviceInteraction.layer,
    auth,
    TokenExchangeTest(options.exchange),
    Layer.provide(CredentialStoreSessionLive, credentialStore),
    PendingDeviceLoginStoreTest(options.pending),
    Layer.succeed(AuthEnvironment, ConfigProvider.fromEnvRecord(options.environment ?? {})),
  );

  return {
    layer,
    presenterState: presenter.state,
    interactionState: interaction.state,
    deviceInteractionState: deviceInteraction.state,
    /** The device code of every device authorization the flow started. */
    deviceAuthorizations,
    /** Every device code the flow presented for polling. */
    polledCodes,
  };
};

/**
 * A presenter that consumes the pending device-login document, the way the
 * application's renderer-backed presenter does under machine output: the
 * browser, clipboard, and human presentation steps must not run afterwards.
 */
export const machineOutputPresenter = {
  tryEmitPendingDeviceLogin: () => Effect.succeed(true),
} as const satisfies Parameters<typeof AuthLoginPresenterTest>[0];

/** A presenter whose every wait is stopped, as a person pressing the stop key does. */
export const abandoningPresenter = {
  tryEmitPendingDeviceLogin: () => Effect.succeed(true),
  abandonWaits: true,
} as const satisfies Parameters<typeof AuthLoginPresenterTest>[0];

/** An unattended device sign-in request reporting through machine output. */
export const deviceLoginRequest = (overrides: Partial<LoginRequest> = {}): LoginRequest => ({
  yes: false,
  deviceCode: true,
  restart: false,
  nonInteractive: true,
  machineOutput: true,
  ...overrides,
});

/** A request that resumes a pending device sign-in instead of starting one. */
export const resumeLoginRequest = (overrides: Partial<LoginRequest> = {}): LoginRequest =>
  deviceLoginRequest({ waitForHumanSeconds: 300, ...overrides });

// -----------------------------------------------------------------------------
// Step-up verification fixtures
// -----------------------------------------------------------------------------

export const stepUpRequestId = "step_fixtureverification";
export const stepUpStatusUrl = `${authRegistry}/v1/auth/step-up/requests/${stepUpRequestId}`;
export const stepUpVerificationUrl = `https://agentxm.ai/step-up/${stepUpRequestId}`;
export const stepUpExpiresAt = "2099-01-01T00:00:00.000Z";

/** One step-up request as the Registry describes it on the wire. */
export const makeStepUpRequest = (action: string, target: string): StepUpRequest => ({
  requestId: stepUpRequestId,
  verificationUrl: stepUpVerificationUrl,
  statusUrl: stepUpStatusUrl,
  expiresAt: stepUpExpiresAt,
  intervalSeconds: 2,
  action,
  target,
});

/** The 401 challenge a Registry write answers with before verification. */
export const stepUpChallenge = (stepUp: StepUpRequest): StepUpRequired =>
  new StepUpRequired({
    stepUp,
    failure: new RegistryProblem({
      category: "auth",
      metadata: { response: { status: 401 } },
      cause: undefined,
    }),
  });
