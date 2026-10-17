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
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import type * as HttpClient from "effect/http/HttpClient";
import {
  RegistryClientFactory,
  RegistryHttpClient,
  makeRegistryClientFactory,
} from "@agentxm/registry-client";
import { passThroughRegistryAuthorization } from "@agentxm/registry-client/testing";

import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions/handle";
import { decodeHttpRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";

import { credentialKey, type CredentialKey } from "../../credentials/credential-key.js";
import type { SelectedRegistry } from "../selected-registry.js";

import {
  AuthClientLive,
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
import { RegistryAccessFailed } from "../errors.js";
import { AuthEnvironment } from "../../adapters/environment.js";
import { AuthLoginInteractionTest } from "../../adapters/login-interaction.js";
import { AuthLoginPresenterTest } from "../login-presenter.js";
import type { LoginRequest } from "../login.js";
import {
  PendingDeviceLoginStoreTest,
  type PendingDeviceLogin,
} from "../pending-device-login-store.js";
import type { CredentialFile } from "../../credentials/schema.js";
import {
  WorkloadCredentialsTest,
  type WorkloadCredentialsService,
} from "../../credentials/workload-credentials.js";

/** The category a typed auth failure carries, or undefined for any other failure. */
export const authFailureCategory = (failure: unknown): string | undefined =>
  failure instanceof RegistryAccessFailed ? failure.category : undefined;

/** The detail a typed auth failure carries, or undefined for any other failure. */
export const authFailureDetail = (failure: unknown): string | undefined =>
  failure instanceof RegistryAccessFailed ? failure.detail : undefined;

export const authRegistry = "https://registry.example.test";
export const otherAuthRegistry = "https://other.example.test";
export const authRegistryHost = "registry.example.test";
export const authEndpoint = decodeHttpRegistryEndpointSync(authRegistry);
export const otherAuthEndpoint = decodeHttpRegistryEndpointSync(otherAuthRegistry);
export const authKey = credentialKey(authEndpoint);
export const otherAuthKey = credentialKey(otherAuthEndpoint);
/** The selected Registry every sign-in, token, and identity example addresses; also the default. */
export const authSelectedRegistry: SelectedRegistry = {
  endpoint: authEndpoint,
  defaultEndpoint: authEndpoint,
  host: authRegistryHost,
};
export const authHandle = normalizeHandle("@alice");
export const authEmail = "alice@example.test";
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
  readonly afterCredentialRead?: (key: CredentialKey) => Effect.Effect<void>;
  readonly pending?: PendingDeviceLogin;
  readonly auth?: Partial<AuthClientService>;
  /** The token endpoints a stored session is renewed and revoked through. */
  readonly exchange?: Partial<TokenExchangeService>;
  /** How a GitHub Actions identity becomes a workload token. */
  readonly workload?: Partial<WorkloadCredentialsService>;
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
    pollDeviceToken: (_endpoint, code) =>
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
        email: authEmail,
        tokenType: "session",
        authority: "account" as const,
        permissions: null,
        resourceRestrictions: null,
        expiresAt: authExpiry,
        approvedAt: null,
        trustedPublisher: null,
      }),
    ...options.auth,
  });

  const credentialStore = Layer.effect(
    CredentialStore,
    Effect.gen(function* () {
      const store = yield* CredentialStore;
      return {
        ...store,
        load: (key: CredentialKey) =>
          store.load(key).pipe(Effect.tap(() => options.afterCredentialRead?.(key) ?? Effect.void)),
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
    WorkloadCredentialsTest(options.workload),
    Layer.provide(CredentialStoreSessionLive, credentialStore),
    PendingDeviceLoginStoreTest(options.pending),
    Layer.succeed(AuthEnvironment, ConfigProvider.fromEnvRecord(options.environment ?? {})),
    // Host detection reads no real file, so no example observes the host's own WSL.
    FileSystem.layerNoop({}),
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

/** A presenter whose every wait is stopped, as a person pressing the stop key does. */
export const abandoningPresenter = {
  abandonWaits: true,
} as const satisfies Parameters<typeof AuthLoginPresenterTest>[0];

/** An unattended device sign-in request reporting through machine output. */
export const deviceLoginRequest = (overrides: Partial<LoginRequest> = {}): LoginRequest => ({
  yes: false,
  deviceCode: true,
  restart: false,
  unattended: true,
  canAsk: false,
  machineOutput: true,
  ...overrides,
});

/** A request that resumes a pending device sign-in instead of starting one. */
export const resumeLoginRequest = (overrides: Partial<LoginRequest> = {}): LoginRequest =>
  deviceLoginRequest({ waitForHumanSeconds: 300, ...overrides });

/**
 * The live `AuthClient` over one transport: grants travel it directly and
 * identity and token management through a factory over it. Nothing attaches
 * a credential the caller did not name.
 */
export const authClientOver = (httpClient: HttpClient.HttpClient) =>
  AuthClientLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(RegistryHttpClient, httpClient),
        Layer.succeed(
          RegistryClientFactory,
          makeRegistryClientFactory({
            httpClient,
            fileSystem: FileSystem.makeNoop({}),
            path: Effect.runSync(Effect.provide(Path.Path, Path.layer)),
            authorization: passThroughRegistryAuthorization,
          }),
        ),
      ),
    ),
  );
