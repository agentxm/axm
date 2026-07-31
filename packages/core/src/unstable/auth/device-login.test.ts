/**
 * Unit tests for the shared device login flow.
 */

import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { makeAppError } from "../app-error/index.js";
import { TestMachineRenderer, TestRenderer, logsByTag } from "../cli-renderer/index.js";
import { handle } from "../test-helpers.js";

import { AuthClientTest } from "./auth-client.js";
import { CredentialStore, CredentialStoreTest } from "./credential-store.js";
import { runDeviceLogin, DeviceLoginInteractionTest } from "./device-login.js";

const REGISTRY_URL = "https://registry.agentxm.ai";

const makeLayers = (opts?: {
  readonly browserOpens?: boolean;
  readonly getMeFails?: boolean;
  readonly machine?: boolean;
  readonly omitCompleteUri?: boolean;
  readonly deviceCodeExpired?: boolean;
}) => {
  const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
  const rendererLayer = renderer.layer;
  const rendererState = renderer.state;
  const interaction = DeviceLoginInteractionTest({
    openBrowser: () => Effect.succeed(opts?.browserOpens ?? false),
    copyToClipboard: () => Effect.succeed(true),
  });

  const authClientLayer = AuthClientTest({
    initiateDeviceFlow: () =>
      Effect.succeed({
        device_code: "dc-123",
        user_code: "ABCD-1234",
        verification_uri: "https://auth.agentxm.ai/device",
        ...(opts?.omitCompleteUri
          ? {}
          : {
              verification_uri_complete: "https://auth.agentxm.ai/device?code=ABCD-1234",
            }),
        interval: 5,
        expires_in: 600,
      }),
    pollDeviceToken: () =>
      opts?.deviceCodeExpired
        ? Effect.fail(makeAppError({ code: "auth", detail: "Login code expired" }))
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
    authClientLayer,
  );

  return {
    layer,
    logs: logsByTag(rendererState),
    rendererState,
    interactionState: interaction.state,
  };
};

describe("runDeviceLogin", () => {
  it.effect("opens and copies the complete verification URL when requested", () => {
    const { layer, logs, rendererState, interactionState } = makeLayers({ browserOpens: true });

    return runDeviceLogin(REGISTRY_URL).pipe(
      Effect.provide(layer),
      Effect.map(() => {
        expect(interactionState.copyToClipboardCalls).toEqual([
          "https://auth.agentxm.ai/device?code=ABCD-1234",
        ]);
        expect(interactionState.openBrowserCalls).toEqual([
          "https://auth.agentxm.ai/device?code=ABCD-1234",
        ]);
        expect(logs.info).toContain("Opening your browser to complete device authorization.");
        expect(logs.info).toContain(
          "1. Open this URL:\n   https://auth.agentxm.ai/device?code=ABCD-1234",
        );
        expect(logs.info).toContain("2. If prompted, enter:\n   ABCD-1234");
        expect(logs.info).toContain("This code expires in 10 minutes.");
        expect(logs.info).toContain("Only continue if you started this sign-in with AXM.");
        expect(logs.success).toContain("Logged in to registry.agentxm.ai as @alice.");
        expect(rendererState.suggestions).toEqual([
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
        expect(logs.info).toContain(
          "1. Open this URL:\n   https://auth.agentxm.ai/device?code=ABCD-1234",
        );
        expect(logs.info).toContain("2. If prompted, enter:\n   ABCD-1234");
      }),
    );
  });

  it.effect("falls back to the base verification URL when a complete URL is unavailable", () => {
    const { layer, logs, interactionState } = makeLayers({ omitCompleteUri: true });

    return runDeviceLogin(REGISTRY_URL, { openBrowser: false }).pipe(
      Effect.provide(layer),
      Effect.map(() => {
        expect(interactionState.copyToClipboardCalls).toEqual(["https://auth.agentxm.ai/device"]);
        expect(logs.info).toContain("1. Open this URL:\n   https://auth.agentxm.ai/device");
        expect(logs.info).toContain("2. If prompted, enter:\n   ABCD-1234");
      }),
    );
  });

  it.effect("reports server-derived expiry and does not save credentials", () => {
    const { layer } = makeLayers({ deviceCodeExpired: true });

    return Effect.gen(function* () {
      const error = yield* Effect.flip(runDeviceLogin(REGISTRY_URL, { openBrowser: false }));
      expect(error).toMatchObject({
        detail:
          "This sign-in code expired after 10 minutes. Run `axm login --device-code` to request a new code.",
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
          verification_uri_complete: "https://auth.agentxm.ai/device?code=ABCD-1234",
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
      authClientLayer,
    );
    const logs = logsByTag(rendererState);

    return runDeviceLogin(REGISTRY_URL).pipe(
      Effect.provide(layer),
      Effect.map(() => {
        expect(logs.info).toContain(
          "1. Open this URL:\n   https://auth.agentxm.ai/device?code=ABCD-1234",
        );
        expect(logs.info).toContain("2. If prompted, enter:\n   ABCD-1234");
        expect(logs.info.some((m) => m.includes("copied to your clipboard"))).toBe(false);
      }),
    );
  });
});
