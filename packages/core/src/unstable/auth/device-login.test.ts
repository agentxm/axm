/**
 * Unit tests for the shared device login flow.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { makeAppError } from "../app-error/index.js";
import { TestRenderer, logsByTag } from "../cli-renderer/index.js";
import { handle } from "../test-helpers.js";

import { AuthClientTest } from "./auth-client.js";
import { CredentialStore, CredentialStoreTest } from "./credential-store.js";
import { runDeviceLogin, DeviceLoginInteractionTest } from "./device-login.js";

const REGISTRY_URL = "https://registry.agentxm.ai";

const makeLayers = (opts?: { readonly browserOpens?: boolean; readonly getMeFails?: boolean }) => {
  const { layer: rendererLayer, state: rendererState } = TestRenderer.make();
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
        verification_uri_complete: "https://auth.agentxm.ai/device?code=ABCD-1234",
        interval: 5,
        expires_in: 600,
      }),
    pollDeviceToken: () =>
      Effect.succeed({
        access_token: "axm_ses_new",
        refresh_token: "axm_ref_new",
        expires_at: "2099-06-01T00:00:00Z",
      }),
    getMe: (_accessToken: string) =>
      opts?.getMeFails
        ? Effect.fail(
            makeAppError({
              code: "AUTH_UNAUTHENTICATED",
              category: "auth",
              message: "Not authenticated or token is invalid",
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
    interactionState: interaction.state,
  };
};

describe("runDeviceLogin", () => {
  it.effect("opens the browser and copies the device code when available", () => {
    const { layer, logs, interactionState } = makeLayers({ browserOpens: true });

    return runDeviceLogin(REGISTRY_URL).pipe(
      Effect.provide(layer),
      Effect.map(() => {
        expect(interactionState.copyToClipboardCalls).toEqual(["ABCD-1234"]);
        expect(interactionState.openBrowserCalls).toEqual([
          "https://auth.agentxm.ai/device?code=ABCD-1234",
        ]);
        expect(logs.step).toContain("Opening browser to sign in...");
        expect(logs.message).toContain("https://auth.agentxm.ai/device?code=ABCD-1234");
        expect(
          logs.step.some((message) =>
            message.includes("Open this URL in your browser: https://auth.agentxm.ai/device"),
          ),
        ).toBe(false);
        expect(logs.step).toContain("Your verification code: ABCD-1234 (copied to clipboard)");
        expect(logs.success).toContain("Logged in to registry.agentxm.ai as @alice.");
      }),
    );
  });

  it.effect("falls back to manual browser instructions when launch fails", () => {
    const { layer, logs } = makeLayers({ browserOpens: false });

    return runDeviceLogin(REGISTRY_URL).pipe(
      Effect.provide(layer),
      Effect.map(() => {
        expect(logs.step).toContain(
          "Open this URL in your browser: https://auth.agentxm.ai/device?code=ABCD-1234",
        );
        expect(logs.step).toContain("Your verification code: ABCD-1234 (copied to clipboard)");
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

  it.effect("omits clipboard hint when clipboard copy fails", () => {
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
          expires_at: "2099-06-01T00:00:00Z",
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
        expect(logs.step).toContain("Your verification code: ABCD-1234");
        expect(logs.step.some((m) => m.includes("copied to clipboard"))).toBe(false);
      }),
    );
  });
});
