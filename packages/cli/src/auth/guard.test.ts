/**
 * Unit tests for the auth guard combinator.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { AuthClientTest } from "./auth-client.js";
import { CredentialStoreTest } from "./credential-store.js";
import { RegistryUrl } from "./auth-middleware.js";
import { TestRenderer, logsByTag } from "@axm.sh/core/unstable/cli-renderer";
import { makeTestPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliEnvironmentTest } from "@axm.sh/core/unstable/cli-flags";
import { withAuthGuard } from "./guard.js";
import { makeAppError } from "@axm.sh/core/unstable/app-error";

const REGISTRY_URL = "https://registry.agentxm.ai";

const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);

const makeInnerEffect = () => Effect.succeed("publish-result" as const);

const makeLayers = (opts?: {
  nonInteractive?: boolean;
  yes?: boolean;
  hasToken?: boolean;
  confirmValue?: boolean;
}) => {
  const { layer: rendererLayer, state: rendererState } = TestRenderer.make();
  const [promptLayer, promptState] = makeTestPrompt({
    confirmResponses: [opts?.confirmValue ?? true],
  });

  const flagsLayer = CliEnvironmentTest({
    nonInteractive: opts?.nonInteractive ?? false,
  });

  const credStoreLayer = opts?.hasToken
    ? CredentialStoreTest("encrypted-file", {
        version: 1,
        registries: {
          [REGISTRY_URL]: {
            accounts: {
              alice: {
                access_token: "axm_ses_existing",
                refresh_token: "axm_ref_existing",
                expires_at: "2099-01-01T00:00:00Z",
                active: true,
              },
            },
          },
        },
      })
    : CredentialStoreTest();

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
    getMe: () =>
      Effect.succeed({
        userId: "user-1",
        userHandle: "alice",
        email: "alice@example.com",
        tokenType: "session",
        scopes: ["extensions:read"],
        orgs: [],
      }),
  });

  const FullLayer = Layer.mergeAll(
    rendererLayer,
    promptLayer,
    flagsLayer,
    credStoreLayer,
    authClientLayer,
    registryUrlLayer,
  );

  const logs = logsByTag(rendererState);
  return { FullLayer, rendererState, promptState, logs };
};

describe("withAuthGuard", () => {
  it.effect("passes through when token is resolvable", () => {
    const { FullLayer } = makeLayers({ hasToken: true });
    return withAuthGuard(makeInnerEffect(), { yes: false }).pipe(
      Effect.provide(FullLayer),
      Effect.map((result) => {
        expect(result).toBe("publish-result");
      }),
    );
  });

  it.effect("fails with AUTH_LOGIN_REQUIRED in non-interactive mode when no token", () => {
    const { FullLayer } = makeLayers({ nonInteractive: true });
    return withAuthGuard(makeInnerEffect(), { yes: false }).pipe(
      Effect.provide(FullLayer),
      Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, code: e.code })),
      Effect.map((result) => {
        expect(result).toMatchObject({ error: true, code: "AUTH_LOGIN_REQUIRED" });
      }),
    );
  });

  it.effect("prompts and runs login when no token and user accepts", () => {
    const { FullLayer, logs } = makeLayers({ confirmValue: true });
    return withAuthGuard(makeInnerEffect(), { yes: false }).pipe(
      Effect.provide(FullLayer),
      Effect.map((result) => {
        expect(result).toBe("publish-result");
        expect(logs.success.some((m) => m.includes("Logged in as alice"))).toBe(true);
      }),
    );
  });

  it.effect("fails with AUTH_LOGIN_REQUIRED when user declines login", () => {
    const { FullLayer } = makeLayers({ confirmValue: false });
    return withAuthGuard(makeInnerEffect(), { yes: false }).pipe(
      Effect.provide(FullLayer),
      Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, code: e.code })),
      Effect.map((result) => {
        expect(result).toMatchObject({ error: true, code: "AUTH_LOGIN_REQUIRED" });
      }),
    );
  });

  it.effect("auto-accepts login with --yes flag", () => {
    const { FullLayer, promptState } = makeLayers({ yes: true });
    return withAuthGuard(makeInnerEffect(), { yes: true }).pipe(
      Effect.provide(FullLayer),
      Effect.map((result) => {
        expect(result).toBe("publish-result");
        // Should not have prompted (--yes auto-accepts)
        expect(promptState.confirmCalls).toHaveLength(0);
      }),
    );
  });

  it.effect("propagates inner effect errors", () => {
    const { FullLayer } = makeLayers({ hasToken: true });
    const failingEffect = Effect.fail(
      makeAppError({ code: "PUBLISH_PLAN_FAILED", what: "Publish failed" }),
    );
    return withAuthGuard(failingEffect, { yes: false }).pipe(
      Effect.provide(FullLayer),
      Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, code: e.code })),
      Effect.map((result) => {
        expect(result).toMatchObject({ error: true, code: "PUBLISH_PLAN_FAILED" });
      }),
    );
  });
});
