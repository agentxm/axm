import { describe, expect, it } from "@effect/vitest";
import * as NodeHttp from "node:http";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";

import { handle } from "./test-helpers.js";
import { AuthClientTest } from "./auth-client.js";
import { CredentialStore, CredentialStoreTest } from "./credential-store.js";
import { DeviceLoginInteractionTest } from "./device-login.js";
import { AuthLoginPresenterTest } from "./login-presenter.js";
import { runLoopbackLogin } from "./loopback-login.js";

const REGISTRY_URL = "https://registry.agentxm.ai";

const request = (url: string) =>
  new Promise<void>((resolve, reject) => {
    const outgoing = NodeHttp.get(url, (response) => {
      response.resume();
      response.on("end", resolve);
    });
    outgoing.on("error", reject);
  });

const callbackFromAuthorizeUrl = (authorizeUrl: string): URL => {
  const authorize = new URL(authorizeUrl);
  const redirectUri = authorize.searchParams.get("redirect_uri");
  const state = authorize.searchParams.get("state");
  if (redirectUri === null || state === null) {
    throw new Error("Expected redirect URI and state");
  }
  const callback = new URL(redirectUri);
  callback.searchParams.set("code", "axm_pubac_exact");
  callback.searchParams.set("state", state);
  callback.searchParams.set("iss", "https://agentxm.ai");
  return callback;
};

const makeAuthClientLayer = () =>
  AuthClientTest({
    buildAuthorizeUrl: ({ redirectUri, state }) => {
      const url = new URL("https://agentxm.ai/oauth/authorize");
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      return url.href;
    },
    exchangePkceCode: () =>
      Effect.succeed({
        access_token: "axm_ses_new",
        refresh_token: "axm_ref_new",
        expires_at: DateTime.makeUnsafe("2099-06-01T00:00:00Z"),
      }),
    getMe: () =>
      Effect.succeed({
        userHandle: handle("@alice"),
        tokenType: "session",
        scopes: ["extensions:read"],
        resourceRestrictions: { extensions: null },
        expiresAt: null,
      }),
  });

describe("runLoopbackLogin", () => {
  it.effect("keeps the listener usable when browser launch fails", () => {
    const presenter = AuthLoginPresenterTest();
    const interaction = DeviceLoginInteractionTest({
      openBrowser: (authorizeUrl) =>
        Effect.sync(() => {
          const callback = callbackFromAuthorizeUrl(authorizeUrl);
          setTimeout(() => {
            void request(callback.href);
          }, 10);
          return false;
        }),
    });
    const layer = Layer.mergeAll(
      presenter.layer,
      interaction.layer,
      CredentialStoreTest(),
      makeAuthClientLayer(),
    );

    return Effect.gen(function* () {
      yield* runLoopbackLogin(REGISTRY_URL);

      expect(presenter.state.loopbackStarts).toHaveLength(1);
      expect(presenter.state.loopbackStarts[0]?.redirectUri).toContain("127.0.0.1");
      expect(presenter.state.loopbackStarts[0]?.authorizeUrl).toContain("oauth/authorize");
      expect(presenter.state.loopbackBrowserOutcomes).toEqual([false]);
      expect(presenter.state.loginSuccesses).toEqual([
        { status: "logged-in", registryHost: "registry.agentxm.ai", handle: "@alice" },
      ]);
      expect(interaction.state.openBrowserCalls).toHaveLength(1);

      const store = yield* CredentialStore;
      const saved = yield* store.load(REGISTRY_URL);
      expect(saved._tag).toBe("Some");
    }).pipe(Effect.provide(layer));
  });

  it.effect("closes the listener and preserves credentials on interruption", () =>
    Effect.gen(function* () {
      const listenerReady = yield* Deferred.make<string>();
      const presenter = AuthLoginPresenterTest();
      const interaction = DeviceLoginInteractionTest({
        openBrowser: (authorizeUrl) =>
          Deferred.succeed(listenerReady, callbackFromAuthorizeUrl(authorizeUrl).origin).pipe(
            Effect.as(false),
          ),
      });
      const credentialLayer = CredentialStoreTest();
      const layer = Layer.mergeAll(
        presenter.layer,
        interaction.layer,
        credentialLayer,
        makeAuthClientLayer(),
      );

      const fiber = yield* runLoopbackLogin(REGISTRY_URL).pipe(
        Effect.provide(layer),
        Effect.forkChild,
      );
      const listenerOrigin = yield* Deferred.await(listenerReady);
      yield* Fiber.interrupt(fiber);

      const connection = yield* Effect.tryPromise(() => request(listenerOrigin)).pipe(Effect.exit);
      expect(connection._tag).toBe("Failure");

      const stored = yield* Effect.gen(function* () {
        const store = yield* CredentialStore;
        return yield* store.load(REGISTRY_URL);
      }).pipe(Effect.provide(credentialLayer));
      expect(stored._tag).toBe("None");
    }),
  );
});
