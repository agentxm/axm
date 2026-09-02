/**
 * Unit tests for the auth logout command handler.
 */

import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { AuthClientTest, CredentialStoreTest } from "@agentxm/registry-auth/testing";
import { RegistryUrl } from "@agentxm/registry-client";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { TestMachineRenderer, TestRenderer, logsByTag } from "../../cli-renderer/index.js";
import { TestFlagsLayer } from "../../cli-flags/index.js";
import { RegistryAuthFailed } from "@agentxm/registry-auth";
import { expectRecord, property } from "../../test-helpers.js";
import { handleLogout } from "./logout.js";

const REGISTRY_URL = "https://registry.agentxm.ai";
const ALICE = normalizeHandle("@alice");

const makeLayers = (opts?: {
  readonly existingCredentials?: boolean;
  readonly revokeFails?: boolean;
  readonly machine?: boolean;
}) => {
  const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
  const rendererLayer = renderer.layer;
  const rendererState = renderer.state;
  const logs = logsByTag(rendererState);
  const revokeTokenCalls: Array<string> = [];

  const credStoreLayer = opts?.existingCredentials
    ? CredentialStoreTest("restricted-file", {
        version: 1,
        registries: {
          [REGISTRY_URL]: {
            accounts: {
              [ALICE]: {
                access_token: "axm_ses_existing",
                refresh_token: "axm_ref_existing",
                expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
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
            new RegistryAuthFailed({
              category: "internal",
              detail: "Revoke failed",
            }),
          )
      : (token) => {
          revokeTokenCalls.push(token);
          return Effect.void;
        },
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

  return { provide, rendererState, logs, revokeTokenCalls };
};

const REGISTRY_HOST = "registry.agentxm.ai";

describe("auth logout handler", () => {
  it.effect("displays success with registry when no credentials", () => {
    const { provide, logs, rendererState } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleLogout();
        expect(logs.success).toContain(`Not logged in to ${REGISTRY_HOST}.`);
        expect(rendererState.suggestions).toEqual([
          { description: "Log in to this registry", cmd: "axm login" },
        ]);
      }),
    );
  });

  it.effect("emits not-logged-in JSON in machine mode without human logs", () => {
    const { provide, rendererState, logs } = makeLayers({ machine: true });
    return provide(
      Effect.gen(function* () {
        yield* handleLogout();
        expect(logs.success).toEqual([]);
        expect(logs.warn).toEqual([]);
        const result = expectRecord(
          property(expectRecord(rendererState.results[0]?.data), "result"),
        );
        expect(result).toEqual({
          status: "not-logged-in",
          registryHost: REGISTRY_HOST,
        });
        expect(rendererState.suggestions).toEqual([
          { description: "Log in to this registry", cmd: "axm login" },
        ]);
      }),
    );
  });

  it.effect("revokes token and shows identity on success", () => {
    const { provide, rendererState, revokeTokenCalls } = makeLayers({ existingCredentials: true });
    return provide(
      Effect.gen(function* () {
        yield* handleLogout();
        expect(revokeTokenCalls).toEqual(["axm_ref_existing"]);
        expect(
          rendererState.logs.some(
            (l) =>
              l._tag === "success" &&
              l.message.includes(REGISTRY_HOST) &&
              l.message.includes(ALICE),
          ),
        ).toBe(true);
        expect(rendererState.suggestions).toEqual([
          { description: "Log in again", cmd: "axm login" },
        ]);
      }),
    );
  });

  it.effect("clears credentials even when revoke fails", () => {
    const { provide, logs, rendererState } = makeLayers({
      existingCredentials: true,
      revokeFails: true,
    });
    return provide(
      Effect.gen(function* () {
        yield* handleLogout();
        expect(
          logs.success.some(
            (message) =>
              message.includes(REGISTRY_HOST) &&
              message.includes(ALICE) &&
              message.includes("token will expire automatically"),
          ),
        ).toBe(true);
        expect(logs.warn).toEqual([]);
        expect(rendererState.suggestions).toEqual([
          { description: "Log in again", cmd: "axm login" },
        ]);
      }),
    );
  });

  it.effect("emits local-only logout JSON in machine mode without warning logs", () => {
    const { provide, rendererState, logs } = makeLayers({
      existingCredentials: true,
      revokeFails: true,
      machine: true,
    });
    return provide(
      Effect.gen(function* () {
        yield* handleLogout();
        expect(logs.success).toEqual([]);
        expect(logs.warn).toEqual([]);
        const result = expectRecord(
          property(expectRecord(rendererState.results[0]?.data), "result"),
        );
        expect(result).toEqual({
          status: "logged-out-local-only",
          registryHost: REGISTRY_HOST,
          handle: ALICE,
        });
        expect(rendererState.suggestions).toEqual([
          { description: "Log in again", cmd: "axm login" },
        ]);
      }),
    );
  });
});
