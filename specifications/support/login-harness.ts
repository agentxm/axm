/**
 * Sign-in harness for the login specifications.
 *
 * Composes the real login presenter over a captured renderer with in-memory
 * stand-ins for the registry's authorization endpoints, the credential store,
 * the pending device sign-in store, and the browser/clipboard interaction. A
 * specification chooses whether a valid session already exists and which
 * output and interactivity mode the command runs in, then reads the rendered
 * documents, the stored credentials, and the recorded prompt as evidence.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  AuthClientTest,
  AuthLoginInteractionTest,
  CredentialStoreTest,
  PendingDeviceLoginStoreTest,
} from "@agentxm/registry-auth/testing";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import {
  AuthLoginPresenterLive,
  CredentialStore,
  RegistryUrl,
  TestFlagsLayer,
  TestMachineRenderer,
  TestRenderer,
  makeEffectProvide,
  type MeResponse,
} from "axm.sh/specification-harness";

export const LOGIN_REGISTRY_URL = "https://registry.agentxm.ai";
export const LOGIN_REGISTRY_HOST = "registry.agentxm.ai";
export const EXISTING_HANDLE = normalizeHandle("@alice");
export const EXISTING_ACCESS_TOKEN = "axm_ses_existing";
export const NEW_ACCESS_TOKEN = "axm_ses_new";
export const DEVICE_USER_CODE = "ABCD-1234";

export interface LoginSpecContextOptions {
  /** Render through the machine (JSON) renderer instead of the human one. */
  readonly machine?: boolean;
  readonly flags?: {
    readonly nonInteractive?: boolean;
    readonly json?: boolean;
  };
  /** Whether a session the registry still accepts is already stored. */
  readonly validSession?: boolean;
}

export const makeLoginSpecContext = (options: LoginSpecContextOptions = {}) => {
  const renderer = options.machine === true ? TestMachineRenderer.make() : TestRenderer.make();
  const identity: MeResponse = {
    userHandle: EXISTING_HANDLE,
    tokenType: "session",
    scopes: ["extensions:read"],
    resourceRestrictions: { extensions: null },
    expiresAt: null,
  };
  const deviceFlowStarts: Array<ReadonlyArray<string>> = [];
  const authClient = AuthClientTest({
    initiateDeviceFlow: (request) =>
      Effect.sync(() => {
        deviceFlowStarts.push(request?.scopes ?? []);
        return {
          device_code: "dc-123",
          user_code: DEVICE_USER_CODE,
          verification_uri: "https://auth.agentxm.ai/device",
          verification_uri_complete: `https://auth.agentxm.ai/device?user_code=${DEVICE_USER_CODE}`,
          interval: 5,
          expires_in: 600,
        };
      }),
    pollDeviceToken: () =>
      Effect.succeed({
        access_token: NEW_ACCESS_TOKEN,
        refresh_token: "axm_ref_new",
        expires_at: DateTime.makeUnsafe("2099-06-01T00:00:00Z"),
      }),
    getMe: () => Effect.succeed(identity),
  });
  const credentialStore =
    options.validSession === true
      ? CredentialStoreTest("restricted-file", {
          version: 1,
          registries: {
            [LOGIN_REGISTRY_URL]: {
              accounts: {
                [EXISTING_HANDLE]: {
                  access_token: EXISTING_ACCESS_TOKEN,
                  refresh_token: "axm_ref_existing",
                  expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
                  active: true,
                },
              },
            },
          },
        })
      : CredentialStoreTest("restricted-file");

  const layer = Layer.mergeAll(
    NodeServices.layer,
    renderer.layer,
    Layer.provide(AuthLoginPresenterLive, renderer.layer),
    AuthLoginInteractionTest().layer,
    TestFlagsLayer({
      nonInteractive: options.flags?.nonInteractive ?? false,
      json: options.flags?.json ?? options.machine === true,
    }),
    credentialStore,
    PendingDeviceLoginStoreTest(),
    authClient,
    Layer.succeed(RegistryUrl, LOGIN_REGISTRY_URL),
  );

  return {
    layer,
    provide: makeEffectProvide(layer),
    rendererState: renderer.state,
    /** The scope sets of every device sign-in the command asked the registry to start. */
    deviceFlowStarts,
    /** The access token the store holds for the registry after the command ran. */
    storedAccessToken: Effect.gen(function* () {
      const store = yield* CredentialStore;
      const stored = yield* store.load(LOGIN_REGISTRY_URL);
      return stored._tag === "Some" ? stored.value.access_token : undefined;
    }).pipe(Effect.provide(layer)),
  };
};
