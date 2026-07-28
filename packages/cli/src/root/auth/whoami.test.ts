/**
 * Unit tests for the auth whoami command handler.
 */

import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  AuthClientTest,
  RegistryUrl,
  CredentialStoreTest,
} from "@agentxm/client-core/unstable/auth";
import { normalizeHandle } from "@agentxm/client-core/unstable/extensions";
import { TestMachineRenderer, TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { expectNoPlanEnvelope } from "../../test-helpers.js";
import { handleWhoami } from "./whoami.js";

const REGISTRY_URL = "https://registry.agentxm.ai";
const ALICE = normalizeHandle("@alice");

const defaultWhoami = { handle: ALICE };

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
                [ALICE]: {
                  access_token: "axm_ses_tok",
                  refresh_token: "axm_ref_tok",
                  expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
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
    getWhoami: () => Effect.succeed(defaultWhoami),
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
        expect(result).toMatchObject({ error: true, code: "auth" });
      }),
    );
  });

  it.effect("fails with auth when persisted credentials are disabled", () => {
    const { provide } = makeLayers({ allowsPersistedCredentials: false });
    return provide(
      Effect.gen(function* () {
        const result = yield* handleWhoami().pipe(
          Effect.catchTag("AppError", (e) =>
            Effect.succeed({
              error: true,
              code: e.code,
              guidance: e.suggestions?.[0]?.description,
            }),
          ),
        );
        expect(result).toMatchObject({
          error: true,
          code: "auth",
          guidance: "Set the AXM_TOKEN environment variable for non-interactive auth.",
        });
      }),
    );
  });

  it.effect("displays identity in human-readable format", () => {
    const { provide, rendererState } = makeLayers({ hasCredentials: true });
    return provide(
      Effect.gen(function* () {
        yield* handleWhoami();

        expect(rendererState.logs).toContainEqual({
          _tag: "message",
          message: `Authenticated as ${ALICE}\nRegistry  ${REGISTRY_URL}\n`,
        });
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
          data: {
            user: ALICE,
            registry: REGISTRY_URL,
          },
        });
        expectNoPlanEnvelope(rendererState.results[0]?.data);
        expect(rendererState.logs).toHaveLength(0);
      }),
    );
  });
});
