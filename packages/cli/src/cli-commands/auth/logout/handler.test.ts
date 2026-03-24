/**
 * Unit tests for the auth logout command handler.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { AuthClientTest } from "../../../auth/auth-client.js";
import { RegistryUrl } from "../../../auth/auth-middleware.js";
import { CredentialStoreTest } from "../../../auth/credential-store.js";
import { makeOutputTestLayer } from "../../../output/index.js";
import { CliFlagsTest } from "../../../cli-flags/index.js";
import { handleLogout } from "./handler.js";

const REGISTRY_URL = "https://registry.agentxm.ai";

const makeLayers = (opts?: { existingCredentials?: boolean; revokeFails?: boolean }) => {
  const [outputLayer, mockLog] = makeOutputTestLayer();

  const credStoreLayer = opts?.existingCredentials
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
    revokeToken: opts?.revokeFails
      ? () =>
          Effect.fail({
            _tag: "AppError" as const,
            code: "AUTH_REVOKE_FAILED",
            what: "Revoke failed",
          } as never)
      : () => Effect.void,
  });

  const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);

  const FullLayer = Layer.mergeAll(
    outputLayer,
    CliFlagsTest(),
    credStoreLayer,
    authClientLayer,
    registryUrlLayer,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
  const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
    effect.pipe(Effect.provide(FullLayer));

  return { provide, mockLog };
};

describe("auth logout handler", () => {
  it.effect("displays Not logged in when no credentials", () => {
    const { provide, mockLog } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleLogout();
        expect(mockLog.logs.info.some((m) => m.includes("Not logged in"))).toBe(true);
      }),
    );
  });

  it.effect("revokes token and clears credentials", () => {
    const { provide, mockLog } = makeLayers({ existingCredentials: true });
    return provide(
      Effect.gen(function* () {
        yield* handleLogout();
        expect(mockLog.logs.success.some((m) => m.includes("Logged out successfully"))).toBe(true);
      }),
    );
  });

  it.effect("clears credentials even when revoke fails", () => {
    const { provide, mockLog } = makeLayers({
      existingCredentials: true,
      revokeFails: true,
    });
    return provide(
      Effect.gen(function* () {
        yield* handleLogout();
        expect(
          mockLog.logs.warn.some((m) => m.includes("Signed out locally, but remote revoke failed")),
        ).toBe(true);
        expect(mockLog.logs.info.some((m) => m.includes("expire automatically"))).toBe(true);
      }),
    );
  });
});
