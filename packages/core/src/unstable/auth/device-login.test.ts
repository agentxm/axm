/**
 * Unit tests for the shared device login flow.
 */

import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { makeAppError } from "../app-error/index.js";
import { TestMachineRenderer, TestRenderer, logsByTag } from "../cli-renderer/index.js";
import { handle } from "../test-helpers.js";

import { AuthClientTest } from "./auth-client.js";
import { CredentialStore, CredentialStoreTest } from "./credential-store.js";
import {
  initiateDeviceLogin,
  resumeDeviceLogin,
  runDeviceLogin,
  DeviceLoginInteractionTest,
} from "./device-login.js";
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
  const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
  const rendererLayer = renderer.layer;
  const rendererState = renderer.state;
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
    rendererLayer,
    interaction.layer,
    CredentialStoreTest(),
    PendingDeviceLoginStoreTest(),
    authClientLayer,
  );

  return {
    layer,
    logs: logsByTag(rendererState),
    rendererState,
    interactionState: interaction.state,
    initiateCalls,
  };
};

describe("runDeviceLogin", () => {
  it.effect("opens the complete verification URL and keeps the clean fallback plus code", () => {
    const { layer, logs, rendererState, interactionState } = makeLayers({ browserOpens: true });

    return runDeviceLogin(REGISTRY_URL).pipe(
      Effect.provide(layer),
      Effect.map(() => {
        expect(interactionState.copyToClipboardCalls).toEqual(["ABCD-1234"]);
        expect(interactionState.openBrowserCalls).toEqual([
          "https://auth.agentxm.ai/device?user_code=ABCD-1234",
        ]);
        expect(logs.info).toContain("Opening your browser to complete device authorization.");
        expect(logs.info).toContain("One-time code:\n\n   ABCD-1234");
        expect(logs.info).toContain("This code expires in 10 minutes.");
        expect(logs.info).toContain("Only continue if you started this sign-in with AXM.");
        expect(logs.info).toContain(
          "Never enter a code that another person or website gave you. If that happened, cancel.",
        );
        expect(rendererState.suggestions).toContainEqual({
          description: "Open the AXM device authorization page",
          url: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
        });
        expect(rendererState.suggestions).toContainEqual({
          description: "Open the clean fallback page and enter the code",
          url: "https://auth.agentxm.ai/device",
        });
        expect(logs.success).toContain("Logged in to registry.agentxm.ai as @alice.");
        expect(rendererState.suggestions).toEqual([
          {
            description: "Open the AXM device authorization page",
            url: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
          },
          {
            description: "Open the clean fallback page and enter the code",
            url: "https://auth.agentxm.ai/device",
          },
          { description: "Check active account", cmd: "axm whoami" },
          { description: "Create an API token", cmd: "axm token create --name <name>" },
        ]);
      }),
    );
  });

  it.effect("prints static manual instructions when browser launch is disabled", () => {
    const { layer, logs, interactionState } = makeLayers({ browserOpens: false });

    return runDeviceLogin(REGISTRY_URL, { openBrowser: false }).pipe(
      Effect.provide(layer),
      Effect.map(() => {
        expect(interactionState.openBrowserCalls).toEqual([]);
        expect(interactionState.copyToClipboardCalls).toEqual(["ABCD-1234"]);
        expect(logs.info).toContain("One-time code:\n\n   ABCD-1234");
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

  it.effect("emits structured login result in machine mode", () => {
    const { layer, logs, rendererState } = makeLayers({ machine: true });

    return runDeviceLogin(REGISTRY_URL, { openBrowser: false }).pipe(
      Effect.provide(layer),
      Effect.map(() => {
        expect(logs.success).toEqual([]);
        expect(logs.info).toContain("One-time code:\n\n   ABCD-1234");
        expect(rendererState.suggestions).toContainEqual({
          description: "Open the AXM device authorization page",
          url: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
        });
        expect(rendererState.results[0]?.data).toMatchObject({
          result: {
            outcome: "applied",
            planName: "Log in to AXM registry",
            appliedCount: 1,
            totalSteps: 1,
            steps: [
              {
                label: "Registry credentials",
                status: "applied",
                artifact: {
                  path: "registry.agentxm.ai",
                  scope: "user",
                  change: "created",
                },
              },
            ],
            status: "logged-in",
            registryHost: "registry.agentxm.ai",
            handle: "@alice",
          },
        });
        expect(rendererState.suggestions).toEqual([
          {
            description: "Open the AXM device authorization page",
            url: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
          },
          {
            description: "Open the clean fallback page and enter the code",
            url: "https://auth.agentxm.ai/device",
          },
          { description: "Check active account", cmd: "axm whoami" },
          { description: "Create an API token", cmd: "axm token create --name <name>" },
        ]);
      }),
    );
  });

  it.effect("persists placeholder credentials and reports generic success when /me fails", () => {
    const { layer, logs } = makeLayers({ getMeFails: true });

    return Effect.gen(function* () {
      yield* runDeviceLogin(REGISTRY_URL).pipe(Effect.provide(layer));

      const store = yield* CredentialStore;
      const stored = yield* store.load(REGISTRY_URL);

      expect(logs.success).toContain("Logged in to registry.agentxm.ai.");
      expect(logs.success.some((message) => message.includes("as "))).toBe(false);
      expect(stored._tag).toBe("Some");
      if (stored._tag === "Some") {
        expect(stored.value.handle).toBe("@unknown");
        expect(stored.value.access_token).toBe("axm_ses_new");
      }
    }).pipe(Effect.provide(layer));
  });

  it.effect("omits URL clipboard hint when clipboard copy fails", () => {
    const { layer: rendererLayer, state: rendererState } = TestRenderer.make();
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
      rendererLayer,
      interaction.layer,
      CredentialStoreTest(),
      PendingDeviceLoginStoreTest(),
      authClientLayer,
    );
    const logs = logsByTag(rendererState);

    return runDeviceLogin(REGISTRY_URL).pipe(
      Effect.provide(layer),
      Effect.map(() => {
        expect(logs.info).toContain("One-time code:\n\n   ABCD-1234");
        expect(logs.info.some((m) => m.includes("copied to your clipboard"))).toBe(false);
      }),
    );
  });
});

describe("resumable device login", () => {
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
