/**
 * Unit tests for the auth logout command handler.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  AuthClientTest,
  RegistryUrl,
  CredentialStoreTest,
} from "@agentxm/client-core/unstable/auth";
import { normalizeHandle } from "@agentxm/client-core/unstable/extensions";
import { TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { handleLogout } from "./logout.js";

const REGISTRY_URL = "https://registry.agentxm.ai";
const ALICE = normalizeHandle("@alice");

const makeLayers = (opts?: { existingCredentials?: boolean; revokeFails?: boolean }) => {
  const { layer: rendererLayer, state: rendererState } = TestRenderer.make();

  const credStoreLayer = opts?.existingCredentials
    ? CredentialStoreTest("restricted-file", {
        version: 1,
        registries: {
          [REGISTRY_URL]: {
            accounts: {
              [ALICE]: {
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
          Effect.fail(
            makeAppError({
              code: "AUTH_REVOKE_FAILED",
              category: "internal",
              what: "Revoke failed",
            }),
          )
      : () => Effect.void,
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

const REGISTRY_HOST = "registry.agentxm.ai";

describe("auth logout handler", () => {
  it.effect("displays success with registry when no credentials", () => {
    const { provide, rendererState } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleLogout();
        expect(
          rendererState.logs.some(
            (l) =>
              l._tag === "success" &&
              l.message.includes("Not logged in to") &&
              l.message.includes(REGISTRY_HOST),
          ),
        ).toBe(true);
      }),
    );
  });

  it.effect("revokes token and shows identity on success", () => {
    const { provide, rendererState } = makeLayers({ existingCredentials: true });
    return provide(
      Effect.gen(function* () {
        yield* handleLogout();
        expect(
          rendererState.logs.some(
            (l) =>
              l._tag === "success" &&
              l.message.includes(REGISTRY_HOST) &&
              l.message.includes(ALICE),
          ),
        ).toBe(true);
      }),
    );
  });

  it.effect("clears credentials even when revoke fails", () => {
    const { provide, rendererState } = makeLayers({
      existingCredentials: true,
      revokeFails: true,
    });
    return provide(
      Effect.gen(function* () {
        yield* handleLogout();
        expect(
          rendererState.logs.some(
            (l) =>
              l._tag === "warn" &&
              l.message.includes(REGISTRY_HOST) &&
              l.message.includes(ALICE) &&
              l.message.includes("token will expire automatically"),
          ),
        ).toBe(true);
      }),
    );
  });
});
