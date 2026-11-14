/**
 * Unit tests for the shared device login flow.
 */

import { decodeHttpRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { resolveUserAxmHome } from "@agentxm/host-primitives";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { credentialKey } from "../credentials/credential-key.js";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as TestClock from "effect/testing/TestClock";

import { handle } from "../test-helpers.js";

import { AuthClientTest } from "./auth-client.js";
import { DeviceLoginCodeExpired, DeviceLoginDenied, RegistryAccessFailed } from "./errors.js";
import { CredentialStore, CredentialStoreTest } from "../credentials/credential-store.js";
import {
  initiateDeviceLogin,
  resumeDeviceLogin,
  runDeviceLogin,
  DeviceLoginInteractionTest,
} from "./device-login.js";
import { AuthLoginPresenterTest } from "./login-presenter.js";
import {
  PendingDeviceLoginStore,
  PendingDeviceLoginStoreLive,
  PendingDeviceLoginStoreTest,
  type PendingDeviceLogin,
} from "./pending-device-login-store.js";
import { authEndpoint, authKey, makeAuthPorts } from "./test-support/test-helpers.js";

const REGISTRY_URL = "https://registry.agentxm.ai";
const REGISTRY = decodeHttpRegistryEndpointSync(REGISTRY_URL);

const makeLayers = (opts?: {
  readonly browserOpens?: boolean;
  readonly getMeFails?: boolean;
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
          verification_uri: "https://agentxm.ai/device",
          verification_uri_complete: "https://agentxm.ai/device?user_code=ABCD-1234",
          interval: 5,
          expires_in: 900,
        };
      }),
    pollDeviceToken: () =>
      opts?.deviceLoginDenied
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
          "https://agentxm.ai/device?user_code=ABCD-1234",
        ]);
        expect(presenterState.handoffs).toMatchObject([
          {
            _tag: "DeviceLogin",
            registryHost: "registry.agentxm.ai",
            verificationUri: "https://agentxm.ai/device",
            verificationUriComplete: "https://agentxm.ai/device?user_code=ABCD-1234",
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
        minutesLeft: 15,
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
          verificationUri: "https://agentxm.ai/device",
          verificationUriComplete: "https://agentxm.ai/device?user_code=ABCD-1234",
          userCode: "ABCD-1234",
          resume: "axm login --device-code --wait-for-human 300 --json",
          action: {
            kind: "open-url",
            url: "https://agentxm.ai/device?user_code=ABCD-1234",
            fallbackUrl: "https://agentxm.ai/device",
            code: "ABCD-1234",
          },
        });
        const pendingStore = yield* PendingDeviceLoginStore;
        expect(Option.isSome(yield* pendingStore.load())).toBe(true);
      }).pipe(Effect.provide(layer));
    },
  );
});

/**
 * The live pending-sign-in store in a temporary AXM home, over a filesystem
 * that records every call, so a test can count reads of the pending record.
 */
const recordedPendingStore = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* fs.makeTempDirectoryScoped({ prefix: "axm-device-login-" });
  const config = ConfigProvider.layer(ConfigProvider.fromEnvRecord({ AXM_USER_HOME: home }));
  const file = path.join(
    yield* resolveUserAxmHome().pipe(Effect.provide(config)),
    "pending-login.json",
  );
  const liveStoreOver = (fileSystem: FileSystem.FileSystem) =>
    PendingDeviceLoginStoreLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.succeed(FileSystem.FileSystem, fileSystem),
          Layer.succeed(Path.Path, path),
          config,
        ),
      ),
    );
  const { fileSystem, recording } = makeRecordingFileSystem(fs);
  // Another invocation's store on the same file, unseen by the recording.
  const foreign = Context.get(yield* Layer.build(liveStoreOver(fs)), PendingDeviceLoginStore);
  return { layer: liveStoreOver(fileSystem), recording, file, fs, foreign };
}).pipe(Effect.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer)));

const pendingRecord: PendingDeviceLogin = {
  version: 3,
  registryUrl: authKey,
  deviceCode: "fixture-device-secret-pending",
  userCode: "WXYZ-9876",
  verificationUri: "https://identity.example.test/device",
  verificationUriComplete: "https://identity.example.test/device?user_code=WXYZ-9876",
  interval: 1,
  expiresAt: DateTime.makeUnsafe("2099-01-01T00:00:00.000Z"),
};

describe("pending record reads of one device sign-in", () => {
  for (const { openBrowser, observed, firstAttemptReads, retryReads } of [
    { openBrowser: false, observed: undefined, firstAttemptReads: 1, retryReads: 1 },
    { openBrowser: true, observed: undefined, firstAttemptReads: 2, retryReads: 2 },
    // The caller's observation serves only the first attempt; the replacement reads for itself.
    { openBrowser: false, observed: Option.none(), firstAttemptReads: 0, retryReads: 1 },
    { openBrowser: true, observed: Option.none(), firstAttemptReads: 1, retryReads: 2 },
  ]) {
    it.effect(
      `replacing an expired code reads the record ${String(retryReads)} more time(s) when openBrowser=${String(openBrowser)}${observed === undefined ? "" : " after the caller observed it"}`,
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const store = yield* recordedPendingStore;
            const readsAtPoll: Array<number> = [];
            const polled: Array<string> = [];
            const ports = makeAuthPorts({
              auth: {
                pollDeviceToken: (_endpoint, code) =>
                  Effect.suspend(() => {
                    polled.push(code);
                    readsAtPoll.push(store.recording.contentReads(store.file));
                    return polled.length === 1
                      ? Effect.fail(new DeviceLoginCodeExpired())
                      : Effect.succeed({
                          access_token: "replacement-access",
                          refresh_token: "replacement-refresh",
                          expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
                        });
                  }),
              },
            });
            const result = yield* runDeviceLogin(authEndpoint, { openBrowser }, observed).pipe(
              Effect.provide(Layer.merge(ports.layer, store.layer)),
            );
            expect(result.status).toBe("logged-in");
            expect(ports.presenterState.deviceCodeReplacements).toEqual([true]);
            // The replacement polls only its own new code.
            expect(ports.deviceAuthorizations).toEqual([
              "fixture-device-secret-1",
              "fixture-device-secret-2",
            ]);
            expect(polled).toEqual(ports.deviceAuthorizations);
            const [first = 0, second = 0] = readsAtPoll;
            expect(first).toBe(firstAttemptReads);
            expect(second - first).toBe(retryReads);
          }),
        ),
    );
  }

  it.effect("a resume of an earlier invocation's sign-in reads the record itself", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* recordedPendingStore;
        yield* store.foreign.save(pendingRecord);
        const ports = makeAuthPorts();
        const result = yield* resumeDeviceLogin(authEndpoint, { timeoutSeconds: 300 }).pipe(
          Effect.provide(Layer.merge(ports.layer, store.layer)),
        );
        expect(result.status).toBe("logged-in");
        expect(ports.polledCodes).toEqual(["fixture-device-secret-pending"]);
        expect(store.recording.contentReads(store.file)).toBe(1);
        expect(yield* store.fs.exists(store.file)).toBe(false);
      }),
    ),
  );

  it.effect("a resume handed a record that has since expired clears it and polls nothing", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* recordedPendingStore;
        const prepared: PendingDeviceLogin = {
          ...pendingRecord,
          expiresAt: DateTime.makeUnsafe("1970-01-01T00:15:00.000Z"),
        };
        yield* store.foreign.save(prepared);
        yield* TestClock.adjust("16 minutes");
        const ports = makeAuthPorts();
        const failure = yield* Effect.flip(
          resumeDeviceLogin(authEndpoint, { prepared }).pipe(
            Effect.provide(Layer.merge(ports.layer, store.layer)),
          ),
        );
        expect(failure).toMatchObject({
          category: "auth_expired",
          detail: "That code expired. Run axm login to get a new one.",
        });
        expect(ports.polledCodes).toEqual([]);
        expect(store.recording.contentReads(store.file)).toBe(0);
        expect(yield* store.fs.exists(store.file)).toBe(false);
      }),
    ),
  );
});
