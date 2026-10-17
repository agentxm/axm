/**
 * Unit tests for the shared device login flow.
 */

import { decodeHttpRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { credentialKey } from "../credentials/credential-key.js";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { handle } from "../test-helpers.js";

import { AuthClientTest } from "./auth-client.js";
import { DeviceLoginCodeExpired, DeviceLoginDenied, RegistryAccessFailed } from "./errors.js";
import { CredentialStore, CredentialStoreTest } from "../credentials/credential-store.js";
import { initiateDeviceLogin, runDeviceLogin, DeviceLoginInteractionTest } from "./device-login.js";
import { AuthLoginPresenterTest } from "./login-presenter.js";
import {
  PendingDeviceLoginStore,
  PendingDeviceLoginStoreTest,
} from "./pending-device-login-store.js";

const REGISTRY_URL = "https://registry.agentxm.ai";
const REGISTRY = decodeHttpRegistryEndpointSync(REGISTRY_URL);

const makeLayers = (opts?: {
  readonly browserOpens?: boolean;
  readonly getMeFails?: boolean;
  readonly deviceCodeExpired?: boolean;
  readonly deviceLoginDenied?: boolean;
  readonly abandonWaits?: boolean;
}) => {
  const presenter = AuthLoginPresenterTest({
    ...(opts?.abandonWaits ? { abandonWaits: true } : {}),
  });
  const deviceAuthorizations: Array<string> = [];
  const interaction = DeviceLoginInteractionTest({
    openBrowser: () => Effect.succeed(opts?.browserOpens ?? false),
  });

  const authClientLayer = AuthClientTest({
    initiateDeviceFlow: () =>
      Effect.sync(() => {
        deviceAuthorizations.push("dc-123");
        return {
          device_code: "dc-123",
          user_code: "ABCD-1234",
          verification_uri: "https://auth.agentxm.ai/device",
          verification_uri_complete: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
          interval: 5,
          expires_in: 600,
        };
      }),
    pollDeviceToken: () =>
      opts?.deviceCodeExpired
        ? Effect.fail(new DeviceLoginCodeExpired())
        : opts?.deviceLoginDenied
          ? Effect.fail(new DeviceLoginDenied())
          : Effect.succeed({
              access_token: "axm_ses_new",
              refresh_token: "axm_ref_new",
              expires_at: DateTime.makeUnsafe("2099-06-01T00:00:00Z"),
            }),
    getMe: () =>
      opts?.getMeFails
        ? Effect.fail(
            new RegistryAccessFailed({
              category: "auth",
              detail: "Not authenticated or token is invalid",
            }),
          )
        : Effect.succeed({
            userHandle: handle("@alice"),
            email: null,
            tokenType: "session",
            authority: "account" as const,
            permissions: null,
            resourceRestrictions: null,
            expiresAt: null,
            approvedAt: null,
            trustedPublisher: null,
          }),
  });

  const layer = Layer.mergeAll(
    presenter.layer,
    interaction.layer,
    CredentialStoreTest(),
    PendingDeviceLoginStoreTest(),
    authClientLayer,
  );

  return {
    layer,
    presenterState: presenter.state,
    interactionState: interaction.state,
    deviceAuthorizations,
  };
};

describe("runDeviceLogin", () => {
  it.effect("opens the complete verification URL and keeps the clean fallback plus code", () => {
    const { layer, presenterState, interactionState } = makeLayers({ browserOpens: true });

    return runDeviceLogin(REGISTRY).pipe(
      Effect.provide(layer),
      Effect.map((result) => {
        // Nothing reaches the clipboard unless the person asks during the wait.
        expect(interactionState.copyToClipboardCalls).toEqual([]);
        expect(interactionState.openBrowserCalls).toEqual([
          "https://auth.agentxm.ai/device?user_code=ABCD-1234",
        ]);
        expect(presenterState.handoffs).toMatchObject([
          {
            _tag: "DeviceLogin",
            registryHost: "registry.agentxm.ai",
            verificationUri: "https://auth.agentxm.ai/device",
            verificationUriComplete: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
            userCode: "ABCD-1234",
            browserOpened: true,
          },
        ]);
        expect(result).toEqual({
          status: "logged-in",
          registryHost: "registry.agentxm.ai",
          handle: "@alice",
        });
      }),
    );
  });

  it.effect("presents the flow without opening a browser when browser launch is disabled", () => {
    const { layer, presenterState, interactionState } = makeLayers({ browserOpens: false });

    return runDeviceLogin(REGISTRY, { openBrowser: false }).pipe(
      Effect.provide(layer),
      Effect.map(() => {
        expect(interactionState.openBrowserCalls).toEqual([]);
        expect(interactionState.copyToClipboardCalls).toEqual([]);
        expect(presenterState.handoffs[0]).toMatchObject({
          _tag: "DeviceLogin",
          userCode: "ABCD-1234",
          browserOpened: false,
        });
      }),
    );
  });

  it.effect("reports server-derived expiry and does not save credentials", () => {
    const { layer } = makeLayers({ deviceCodeExpired: true });

    return Effect.gen(function* () {
      const error = yield* Effect.flip(runDeviceLogin(REGISTRY, { openBrowser: false }));
      expect(error).toMatchObject({
        category: "auth_expired",
        detail: "That code expired. Run axm login to get a new one.",
      });

      const store = yield* CredentialStore;
      expect((yield* store.load(credentialKey(REGISTRY)))._tag).toBe("None");
    }).pipe(Effect.provide(layer));
  });

  it.effect("says the sign-in was canceled in the browser and changes nothing", () => {
    const { layer } = makeLayers({ deviceLoginDenied: true });

    return Effect.gen(function* () {
      const error = yield* Effect.flip(runDeviceLogin(REGISTRY, { openBrowser: false }));
      expect(error).toMatchObject({
        category: "auth_denied",
        detail: "Sign-in canceled in the browser. Nothing changed.",
      });

      const store = yield* CredentialStore;
      expect((yield* store.load(credentialKey(REGISTRY)))._tag).toBe("None");
      const pendingStore = yield* PendingDeviceLoginStore;
      expect(Option.isNone(yield* pendingStore.load())).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect("says how many whole minutes a stopped wait's code is still good for", () => {
    const { layer } = makeLayers({ abandonWaits: true });

    return Effect.gen(function* () {
      const stopped = yield* Effect.flip(runDeviceLogin(REGISTRY, { openBrowser: false }));
      expect(stopped).toMatchObject({
        _tag: "DeviceAuthorizationPending",
        waitEnded: { _tag: "Stopped" },
        minutesLeft: 10,
      });

      const pendingStore = yield* PendingDeviceLoginStore;
      expect(Option.isSome(yield* pendingStore.load())).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect("persists placeholder credentials and reports generic success when /me fails", () => {
    const { layer } = makeLayers({ getMeFails: true });

    return Effect.gen(function* () {
      const result = yield* runDeviceLogin(REGISTRY);

      const store = yield* CredentialStore;
      const stored = yield* store.load(credentialKey(REGISTRY));

      expect(result).toEqual({ status: "logged-in", registryHost: "registry.agentxm.ai" });
      expect(stored._tag).toBe("Some");
      if (stored._tag === "Some") {
        expect(stored.value.handle).toBe("@unknown");
        expect(stored.value.access_token).toBe("axm_ses_new");
      }
    }).pipe(Effect.provide(layer));
  });
});

describe("resumable device login", () => {
  it.effect("returns pending authorization without opening a browser or waiting", () => {
    const { layer, presenterState, interactionState } = makeLayers();

    return Effect.gen(function* () {
      const result = yield* initiateDeviceLogin(REGISTRY);
      expect(result.status).toBe("pending-human");
      expect(interactionState.openBrowserCalls).toEqual([]);
      expect(interactionState.copyToClipboardCalls).toEqual([]);
      expect(presenterState.handoffs).toEqual([]);
      expect(presenterState.pendingApprovals).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    "starts without polling and emits complete and fallback URLs plus separate code",
    () => {
      const { layer } = makeLayers();

      return Effect.gen(function* () {
        const result = yield* initiateDeviceLogin(REGISTRY);
        expect(result).toMatchObject({
          status: "pending-human",
          blockedOn: "human",
          retryable: true,
          flow: "started",
          verificationUri: "https://auth.agentxm.ai/device",
          verificationUriComplete: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
          userCode: "ABCD-1234",
          resume: "axm login --device-code --wait-for-human 300 --json",
          action: {
            kind: "open-url",
            url: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
            fallbackUrl: "https://auth.agentxm.ai/device",
            code: "ABCD-1234",
          },
        });
        const pendingStore = yield* PendingDeviceLoginStore;
        expect(Option.isSome(yield* pendingStore.load())).toBe(true);
      }).pipe(Effect.provide(layer));
    },
  );
});
