/**
 * Unit tests for the shared device login flow.
 */

import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { makeAppError } from "../app-error/index.js";
import { handle } from "../test-helpers.js";

import { AuthClientTest } from "./auth-client.js";
import { CredentialStore, CredentialStoreTest } from "./credential-store.js";
import {
  initiateDeviceLogin,
  resumeDeviceLogin,
  runDeviceLogin,
  DeviceLoginInteractionTest,
} from "./device-login.js";
import { AuthLoginPresenterTest } from "./login-presenter.js";
import {
  PendingDeviceLoginStore,
  PendingDeviceLoginStoreTest,
} from "./pending-device-login-store.js";

const REGISTRY_URL = "https://registry.agentxm.ai";

const makeLayers = (opts?: {
  readonly browserOpens?: boolean;
  readonly getMeFails?: boolean;
  readonly machine?: boolean;
  readonly deviceCodeExpired?: boolean;
  readonly deviceCodeDenied?: boolean;
  readonly pollNever?: boolean;
}) => {
  // Machine mode mirrors the CLI Live: the pending document is consumed and
  // the human path is skipped.
  const presenter = AuthLoginPresenterTest(
    opts?.machine ? { tryEmitPendingDeviceLogin: () => Effect.succeed(true) } : undefined,
  );
  const initiateCalls: Array<ReadonlyArray<string> | undefined> = [];
  const interaction = DeviceLoginInteractionTest({
    openBrowser: () => Effect.succeed(opts?.browserOpens ?? false),
    copyToClipboard: () => Effect.succeed(true),
  });

  const authClientLayer = AuthClientTest({
    initiateDeviceFlow: (options) =>
      Effect.sync(() => {
        initiateCalls.push(options?.scopes);
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
      opts?.pollNever
        ? Effect.never
        : opts?.deviceCodeExpired
          ? Effect.fail(makeAppError({ code: "auth", detail: "Login code expired" }))
          : opts?.deviceCodeDenied
            ? Effect.fail(makeAppError({ code: "auth", detail: "Login was denied or cancelled" }))
            : Effect.succeed({
                access_token: "axm_ses_new",
                refresh_token: "axm_ref_new",
                expires_at: DateTime.makeUnsafe("2099-06-01T00:00:00Z"),
              }),
    getMe: (_accessToken: string) =>
      opts?.getMeFails
        ? Effect.fail(
            makeAppError({
              code: "auth",
              detail: "Not authenticated or token is invalid",
            }),
          )
        : Effect.succeed({
            userId: "user-1",
            userHandle: handle("@alice"),
            email: "alice@example.com",
            tokenType: "session",
            scopes: ["extensions:read"],
            orgs: [],
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
    initiateCalls,
  };
};

describe("runDeviceLogin", () => {
  it.effect("opens the complete verification URL and keeps the clean fallback plus code", () => {
    const { layer, presenterState, interactionState } = makeLayers({ browserOpens: true });

    return runDeviceLogin(REGISTRY_URL).pipe(
      Effect.provide(layer),
      Effect.map(() => {
        expect(interactionState.copyToClipboardCalls).toEqual(["ABCD-1234"]);
        expect(interactionState.openBrowserCalls).toEqual([
          "https://auth.agentxm.ai/device?user_code=ABCD-1234",
        ]);
        expect(presenterState.deviceFlowPresentations).toEqual([
          {
            verificationUri: "https://auth.agentxm.ai/device",
            verificationUriComplete: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
            userCode: "ABCD-1234",
            expiresInSeconds: 600,
            browserOpened: true,
            copiedToClipboard: true,
          },
        ]);
        expect(presenterState.loginSuccesses).toEqual([
          { status: "logged-in", registryHost: "registry.agentxm.ai", handle: "@alice" },
        ]);
      }),
    );
  });

  it.effect("presents the flow without opening a browser when browser launch is disabled", () => {
    const { layer, presenterState, interactionState } = makeLayers({ browserOpens: false });

    return runDeviceLogin(REGISTRY_URL, { openBrowser: false }).pipe(
      Effect.provide(layer),
      Effect.map(() => {
        expect(interactionState.openBrowserCalls).toEqual([]);
        expect(interactionState.copyToClipboardCalls).toEqual(["ABCD-1234"]);
        expect(presenterState.deviceFlowPresentations[0]).toMatchObject({
          userCode: "ABCD-1234",
          browserOpened: false,
        });
      }),
    );
  });

  it.effect("reports server-derived expiry and does not save credentials", () => {
    const { layer } = makeLayers({ deviceCodeExpired: true });

    return Effect.gen(function* () {
      const error = yield* Effect.flip(runDeviceLogin(REGISTRY_URL, { openBrowser: false }));
      expect(error).toMatchObject({
        code: "auth_expired",
        detail: "The pending device sign-in expired. No credentials were changed.",
      });

      const store = yield* CredentialStore;
      expect((yield* store.load(REGISTRY_URL))._tag).toBe("None");
    }).pipe(Effect.provide(layer));
  });

  it.effect("persists placeholder credentials and reports generic success when /me fails", () => {
    const { layer, presenterState } = makeLayers({ getMeFails: true });

    return Effect.gen(function* () {
      yield* runDeviceLogin(REGISTRY_URL).pipe(Effect.provide(layer));

      const store = yield* CredentialStore;
      const stored = yield* store.load(REGISTRY_URL);

      expect(presenterState.loginSuccesses).toEqual([
        { status: "logged-in", registryHost: "registry.agentxm.ai" },
      ]);
      expect(stored._tag).toBe("Some");
      if (stored._tag === "Some") {
        expect(stored.value.handle).toBe("@unknown");
        expect(stored.value.access_token).toBe("axm_ses_new");
      }
    }).pipe(Effect.provide(layer));
  });

  it.effect("reports clipboard copy failure through the presentation", () => {
    const presenter = AuthLoginPresenterTest();
    const interaction = DeviceLoginInteractionTest({
      openBrowser: () => Effect.succeed(true),
      copyToClipboard: () => Effect.succeed(false),
    });

    const authClientLayer = AuthClientTest({
      initiateDeviceFlow: () =>
        Effect.succeed({
          device_code: "dc-123",
          user_code: "ABCD-1234",
          verification_uri: "https://auth.agentxm.ai/device",
          verification_uri_complete: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
          interval: 5,
          expires_in: 600,
        }),
      pollDeviceToken: () =>
        Effect.succeed({
          access_token: "axm_ses_new",
          refresh_token: "axm_ref_new",
          expires_at: DateTime.makeUnsafe("2099-06-01T00:00:00Z"),
        }),
      getMe: (_accessToken: string) =>
        Effect.succeed({
          userId: "user-1",
          userHandle: handle("@alice"),
          email: "alice@example.com",
          tokenType: "session",
          scopes: ["extensions:read"],
          orgs: [],
        }),
    });

    const layer = Layer.mergeAll(
      presenter.layer,
      interaction.layer,
      CredentialStoreTest(),
      PendingDeviceLoginStoreTest(),
      authClientLayer,
    );

    return runDeviceLogin(REGISTRY_URL).pipe(
      Effect.provide(layer),
      Effect.map(() => {
        expect(presenter.state.deviceFlowPresentations[0]).toMatchObject({
          userCode: "ABCD-1234",
          copiedToClipboard: false,
        });
      }),
    );
  });
});

describe("resumable device login", () => {
  it.effect("emits the pending document before any side effect in machine mode", () => {
    const { layer, presenterState, interactionState } = makeLayers({ machine: true });

    return Effect.gen(function* () {
      const result = yield* initiateDeviceLogin(REGISTRY_URL);
      expect(result.status).toBe("pending-human");
      expect(presenterState.pendingEmissions).toHaveLength(1);
      expect(interactionState.openBrowserCalls).toEqual([]);
      expect(interactionState.copyToClipboardCalls).toEqual([]);
      expect(presenterState.deviceFlowPresentations).toEqual([]);
      expect(presenterState.pendingApprovals).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("performs side effects, presents, and notes approval on the human path", () => {
    const { layer, presenterState, interactionState } = makeLayers({ browserOpens: true });

    return Effect.gen(function* () {
      const result = yield* initiateDeviceLogin(REGISTRY_URL);
      expect(result.status).toBe("pending-human");
      expect(presenterState.pendingEmissions).toHaveLength(1);
      expect(interactionState.copyToClipboardCalls).toEqual(["ABCD-1234"]);
      expect(interactionState.openBrowserCalls).toEqual([
        "https://auth.agentxm.ai/device?user_code=ABCD-1234",
      ]);
      expect(presenterState.deviceFlowPresentations).toHaveLength(1);
      expect(presenterState.pendingApprovals).toHaveLength(1);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    "starts without polling and emits complete and fallback URLs plus separate code",
    () => {
      const { layer } = makeLayers({ machine: true });

      return Effect.gen(function* () {
        const result = yield* initiateDeviceLogin(REGISTRY_URL, { openBrowser: false });
        expect(result).toMatchObject({
          status: "pending-human",
          blockedOn: "human",
          retryable: true,
          flow: "started",
          verificationUri: "https://auth.agentxm.ai/device",
          verificationUriComplete: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
          requestedScopes: [
            "account:read",
            "email",
            "extensions:read",
            "offline_access",
            "openid",
            "profile",
          ],
          userCode: "ABCD-1234",
          resume: "axm login --wait --json",
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

  it.effect("re-emits an equivalent unexpired flow without replacing its device code", () => {
    const { layer, initiateCalls } = makeLayers({ machine: true });

    return Effect.gen(function* () {
      const first = yield* initiateDeviceLogin(REGISTRY_URL, {
        openBrowser: false,
        scopes: ["extensions:read", "account:read"],
      });
      const second = yield* initiateDeviceLogin(REGISTRY_URL, {
        openBrowser: false,
        scopes: ["account:read", "extensions:read", "extensions:read"],
      });

      expect(second).toEqual({ ...first, flow: "re-emitted" });
      expect(initiateCalls).toHaveLength(1);
    }).pipe(Effect.provide(layer));
  });

  it.effect("conflicts on a different scope set and replaces only with restart", () => {
    const { layer, initiateCalls } = makeLayers({ machine: true });

    return Effect.gen(function* () {
      yield* initiateDeviceLogin(REGISTRY_URL, {
        openBrowser: false,
        scopes: ["extensions:read"],
      });
      const conflict = yield* Effect.flip(
        initiateDeviceLogin(REGISTRY_URL, {
          openBrowser: false,
          scopes: ["account:write"],
        }),
      );
      expect(conflict).toMatchObject({ code: "conflict" });

      yield* initiateDeviceLogin(REGISTRY_URL, {
        openBrowser: false,
        restart: true,
        scopes: ["account:write"],
      });
      expect(initiateCalls).toHaveLength(2);
    }).pipe(Effect.provide(layer));
  });

  it.effect("resumes a persisted flow, saves credentials, and clears it", () => {
    const { layer } = makeLayers({ machine: true });

    return Effect.gen(function* () {
      yield* initiateDeviceLogin(REGISTRY_URL, { openBrowser: false });
      yield* resumeDeviceLogin(REGISTRY_URL);

      const credentials = yield* CredentialStore;
      expect(Option.isSome(yield* credentials.load(REGISTRY_URL))).toBe(true);
      const pendingStore = yield* PendingDeviceLoginStore;
      expect(Option.isNone(yield* pendingStore.load())).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect("fails clearly when no pending flow exists", () => {
    const { layer } = makeLayers({ machine: true });

    return Effect.gen(function* () {
      const error = yield* Effect.flip(resumeDeviceLogin(REGISTRY_URL));
      expect(error).toMatchObject({
        code: "not_found",
        detail: "No pending device sign-in was found.",
      });
      if (error._tag !== "AppError") throw new Error("Expected AppError");
      expect(error.suggestions).toContainEqual({
        description: "Start a device sign-in first.",
        cmd: "axm login --device-code --json",
      });
    }).pipe(Effect.provide(layer));
  });

  it.effect("uses a distinct denial code and clears the terminal flow", () => {
    const { layer } = makeLayers({ machine: true, deviceCodeDenied: true });

    return Effect.gen(function* () {
      yield* initiateDeviceLogin(REGISTRY_URL, { openBrowser: false });
      const error = yield* Effect.flip(resumeDeviceLogin(REGISTRY_URL));
      expect(error).toMatchObject({ code: "auth_denied" });
      const pendingStore = yield* PendingDeviceLoginStore;
      expect(Option.isNone(yield* pendingStore.load())).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect("uses a distinct timeout code and keeps the resumable flow", () => {
    const { layer } = makeLayers({ machine: true, pollNever: true });

    return Effect.gen(function* () {
      yield* initiateDeviceLogin(REGISTRY_URL, { openBrowser: false });
      const error = yield* Effect.flip(resumeDeviceLogin(REGISTRY_URL, { timeoutSeconds: 0 }));
      expect(error).toMatchObject({
        code: "timeout",
        status: "pending-human",
        blockedOn: "human",
        retryable: true,
        action: {
          url: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
          fallbackUrl: "https://auth.agentxm.ai/device",
          code: "ABCD-1234",
          resume: "axm login --wait --json",
        },
      });
      const pendingStore = yield* PendingDeviceLoginStore;
      expect(Option.isSome(yield* pendingStore.load())).toBe(true);
    }).pipe(Effect.provide(layer));
  });
});
