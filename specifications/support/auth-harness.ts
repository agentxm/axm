/** Real authentication handlers and presenter with controlled Registry and credential ports. */
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  AuthClientTest,
  AuthLoginInteractionTest,
  CredentialStoreTest,
  DeviceLoginInteractionTest,
  PendingDeviceLoginStoreTest,
} from "@agentxm/registry-auth/testing";
import type { CredentialFile, PendingDeviceLogin } from "axm.sh/specification-harness";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import {
  AuthLoginPresenterLive,
  RegistryUrl,
  TestFlagsLayer,
  TestMachineRenderer,
  TestRenderer,
  makeEffectProvide,
} from "axm.sh/specification-harness";

export const authRegistry = "https://registry.example.test";
export const otherAuthRegistry = "https://other.example.test";
export const authHandle = normalizeHandle("@alice");
export const authExpiry = DateTime.makeUnsafe("2099-01-01T00:00:00.000Z");
export const storedAuthCredentials = {
  access_token: "fixture-stored-access",
  refresh_token: "fixture-stored-refresh",
  expires_at: authExpiry,
  active: true,
};
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
export const loginOptions = { yes: false, deviceCode: true, scopes: ["extensions:read"] };
export const resumeLoginOptions = { yes: false, deviceCode: false, scopes: [], wait: true };

export const makeAuthSpecContext = (
  options: {
    readonly machine?: boolean;
    readonly credentials?: CredentialFile;
    readonly allowsPersistedCredentials?: boolean;
    readonly pending?: PendingDeviceLogin;
    readonly registry?: string;
    readonly auth?: Parameters<typeof AuthClientTest>[0];
  } = {},
) => {
  const renderer = options.machine === false ? TestRenderer.make() : TestMachineRenderer.make();
  const interaction = AuthLoginInteractionTest();
  const deviceInteraction = DeviceLoginInteractionTest();
  const requestedScopes: Array<ReadonlyArray<string>> = [];
  const polledCodes: string[] = [];
  const auth = AuthClientTest({
    initiateDeviceFlow: (request) =>
      Effect.sync(() => {
        requestedScopes.push(request?.scopes ?? []);
        return {
          device_code: `fixture-device-secret-${requestedScopes.length}`,
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
        scopes: ["extensions:read"],
        resourceRestrictions: { extensions: null },
        expiresAt: authExpiry,
      }),
    ...options.auth,
  });
  const layer = Layer.mergeAll(
    renderer.layer,
    AuthLoginPresenterLive.pipe(Layer.provide(renderer.layer)),
    TestFlagsLayer({ nonInteractive: true, json: options.machine !== false }),
    Layer.succeed(RegistryUrl, options.registry ?? authRegistry),
    CredentialStoreTest("restricted-file", options.credentials, options.allowsPersistedCredentials),
    PendingDeviceLoginStoreTest(options.pending),
    auth,
    interaction.layer,
    deviceInteraction.layer,
  );
  return {
    layer,
    provide: makeEffectProvide(layer),
    rendererState: renderer.state,
    interactionState: interaction.state,
    deviceInteractionState: deviceInteraction.state,
    requestedScopes,
    polledCodes,
  };
};
