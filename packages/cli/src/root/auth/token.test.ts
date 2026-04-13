/**
 * Unit tests for the auth token command handler.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import {
  AuthClientTest,
  CredentialStoreTest,
  RegistryUrl,
} from "@agentxm/client-core/unstable/auth";
import { normalizeHandle } from "@agentxm/client-core/unstable/extensions";
import { TestMachineRenderer, TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { handleToken } from "./token.js";

const REGISTRY_URL = "https://registry.agentxm.ai";
const ALICE = normalizeHandle("@alice");

const makeLayers = (opts?: {
  hasCredentials?: boolean;
  machine?: boolean;
  json?: boolean;
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
                  access_token: "axm_ses_mytoken",
                  refresh_token: "axm_ref_mytoken",
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

  const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);

  const FullLayer = Layer.mergeAll(
    rendererLayer,
    TestFlagsLayer({ ...(opts?.json !== undefined && { json: opts.json }) }),
    credStoreLayer,
    AuthClientTest(),
    registryUrlLayer,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
  const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
    effect.pipe(Effect.provide(FullLayer));

  return { provide, rendererState };
};

describe("auth token handler", () => {
  let origAxmToken: string | undefined;

  beforeEach(() => {
    origAxmToken = process.env["AXM_TOKEN"];
    delete process.env["AXM_TOKEN"];
  });

  afterEach(() => {
    if (origAxmToken !== undefined) process.env["AXM_TOKEN"] = origAxmToken;
    else delete process.env["AXM_TOKEN"];
  });

  it.effect("fails with AUTH_LOGIN_REQUIRED when no token", () => {
    const { provide } = makeLayers();
    return provide(
      Effect.gen(function* () {
        const result = yield* handleToken().pipe(
          Effect.catchTag("AppError", (e) =>
            Effect.succeed({
              error: true,
              code: e.code,
              howToFix: Option.getOrUndefined(e.howToFix),
            }),
          ),
        );
        expect(result).toMatchObject({ error: true, code: "AUTH_LOGIN_REQUIRED" });
      }),
    );
  });

  it.effect("fails with AUTH_TOKEN_REQUIRED when persisted credentials are disabled", () => {
    const { provide } = makeLayers({ allowsPersistedCredentials: false });
    return provide(
      Effect.gen(function* () {
        const result = yield* handleToken().pipe(
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

  it.effect("outputs token from credential store to stdout", () => {
    const { provide, rendererState } = makeLayers({ hasCredentials: true });

    return provide(
      Effect.gen(function* () {
        yield* handleToken();
        expect(rendererState.logs).toContainEqual({
          _tag: "message",
          message: "axm_ses_mytoken\n",
        });
      }),
    );
  });

  it.effect("outputs structured JSON when --json is explicitly requested", () => {
    const { provide, rendererState } = makeLayers({
      hasCredentials: true,
      machine: true,
      json: true,
    });

    return provide(
      Effect.gen(function* () {
        yield* handleToken();
        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          _version: 1,
          command: "auth.token",
          data: { token: "axm_ses_mytoken" },
        });
      }),
    );
  });

  it.effect("outputs token from AXM_TOKEN env var", () => {
    process.env["AXM_TOKEN"] = "axm_env_test_token";
    const { provide, rendererState } = makeLayers();

    return provide(
      Effect.gen(function* () {
        yield* handleToken();
        expect(rendererState.logs).toContainEqual({
          _tag: "message",
          message: "axm_env_test_token\n",
        });
      }),
    );
  });
});
