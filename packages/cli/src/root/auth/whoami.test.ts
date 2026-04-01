/**
 * Unit tests for the auth whoami command handler.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { AuthClientTest, RegistryUrl, CredentialStoreTest } from "@axm.sh/core/unstable/auth";
import { TestMachineRenderer, TestRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { TestFlagsLayer } from "@axm.sh/core/unstable/cli-flags";
import { handleWhoami } from "./whoami.js";

const REGISTRY_URL = "https://registry.agentxm.ai";

const defaultMe = {
  userId: "user-1",
  userHandle: "alice",
  email: "alice@example.com",
  tokenType: "session",
  scopes: ["extensions:read", "account:read"],
  orgs: [{ id: "org-1", handle: "acme" }],
};

const makeLayers = (opts?: {
  hasCredentials?: boolean;
  machine?: boolean;
  allowsPersistedCredentials?: boolean;
}) => {
  const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
  const rendererLayer = renderer.layer;
  const rendererState = renderer.state;
  const credStoreLayer = opts?.hasCredentials
    ? CredentialStoreTest(
        "restricted-file",
        {
          version: 1,
          registries: {
            [REGISTRY_URL]: {
              accounts: {
                alice: {
                  access_token: "axm_ses_tok",
                  refresh_token: "axm_ref_tok",
                  expires_at: "2099-01-01T00:00:00Z",
                  active: true,
                },
              },
            },
          },
        },
        opts?.allowsPersistedCredentials,
      )
    : CredentialStoreTest("restricted-file", undefined, opts?.allowsPersistedCredentials);

  const authClientLayer = AuthClientTest({
    getMe: () => Effect.succeed(defaultMe),
  });

  const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);

  const FullLayer = Layer.mergeAll(
    rendererLayer,
    TestFlagsLayer(),
    credStoreLayer,
    authClientLayer,
    registryUrlLayer,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
  const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
    effect.pipe(Effect.provide(FullLayer));

  return { provide, rendererState };
};

describe("auth whoami handler", () => {
  it.effect("fails with AUTH_LOGIN_REQUIRED when no token", () => {
    const { provide } = makeLayers();
    return provide(
      Effect.gen(function* () {
        const result = yield* handleWhoami().pipe(
          Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, code: e.code })),
        );
        expect(result).toMatchObject({ error: true, code: "AUTH_LOGIN_REQUIRED" });
      }),
    );
  });

  it.effect("fails with AUTH_TOKEN_REQUIRED when persisted credentials are disabled", () => {
    const { provide } = makeLayers({ allowsPersistedCredentials: false });
    return provide(
      Effect.gen(function* () {
        const result = yield* handleWhoami().pipe(
          Effect.catchTag("AppError", (e) =>
            Effect.succeed({
              error: true,
              code: e.code,
              howToFix: Option.getOrUndefined(e.howToFix),
            }),
          ),
        );
        expect(result).toMatchObject({
          error: true,
          code: "AUTH_TOKEN_REQUIRED",
          howToFix: "Set the AXM_TOKEN environment variable instead of running `axm login`.",
        });
      }),
    );
  });

  it.effect("displays identity in human-readable format", () => {
    const { provide, rendererState } = makeLayers({ hasCredentials: true });
    return provide(
      Effect.gen(function* () {
        yield* handleWhoami();
        expect(
          rendererState.logs.some((l) => l._tag === "info" && l.message.includes("alice")),
        ).toBe(true);
        expect(
          rendererState.logs.some(
            (l) => l._tag === "info" && l.message.includes("alice@example.com"),
          ),
        ).toBe(true);
        expect(
          rendererState.logs.some((l) => l._tag === "info" && l.message.includes("session")),
        ).toBe(true);
      }),
    );
  });

  it.effect("emits machine-readable output through CliRenderer in machine mode", () => {
    const { provide, rendererState } = makeLayers({ hasCredentials: true, machine: true });

    return provide(
      Effect.gen(function* () {
        yield* handleWhoami();
        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          userHandle: "alice",
          email: "alice@example.com",
          tokenType: "session",
        });
        expect(rendererState.logs).toHaveLength(0);
      }),
    );
  });
});
