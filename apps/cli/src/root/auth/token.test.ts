/**
 * Unit tests for the auth token command handler.
 */

import { RegistryContextTest } from "@agentxm/registry-client/testing";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  AuthClientTest,
  AuthLoginInteractionTest,
  CredentialStoreTest,
  WorkloadCredentialsTest,
} from "@agentxm/registry-access/testing";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { makeTestScreen, messages, tables } from "../../test-support/test-screen.js";
import { TestFlagsLayer } from "../../cli-flags/index.js";
import { AuthLoginPresenterLive } from "../../auth-login-presenter.js";
import { expectNoPlanEnvelope, expectRecord, property } from "../../test-support/test-helpers.js";
import { handleListTokens, handleRevokeToken, handleToken } from "./token.js";

const REGISTRY_URL = "https://registry.agentxm.ai";
const ALICE = normalizeHandle("@alice");

const makeLayers = (opts?: {
  hasCredentials?: boolean;
  machine?: boolean;
  json?: boolean;
  nonInteractive?: boolean;
  allowsPersistedCredentials?: boolean;
  authOverrides?: Parameters<typeof AuthClientTest>[0];
  environment?: Record<string, string>;
}) => {
  const renderer = makeTestScreen({ machine: opts?.machine === true });
  const interaction = AuthLoginInteractionTest({
    openBrowser: () => Effect.succeed(true),
  });
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

  const registryUrlLayer = RegistryContextTest(REGISTRY_URL);

  const FullLayer = Layer.mergeAll(
    rendererLayer,
    TestFlagsLayer({
      ...(opts?.json !== undefined && { json: opts.json }),
      ...(opts?.nonInteractive !== undefined && { nonInteractive: opts.nonInteractive }),
    }),
    credStoreLayer,
    WorkloadCredentialsTest(),
    AuthClientTest(opts?.authOverrides),
    interaction.layer,
    Layer.provide(AuthLoginPresenterLive, Layer.mergeAll(rendererLayer, interaction.layer)),
    registryUrlLayer,
    ConfigProvider.layer(
      ConfigProvider.fromEnv({ env: opts?.environment ?? {}, preserveEmptyStrings: true }),
    ),
  );
  const provide = Effect.provide(FullLayer);

  return { provide, rendererState };
};

describe("auth token handler", () => {
  it.effect("reports being signed out when no credential resolves", () => {
    const { provide } = makeLayers();
    return provide(
      Effect.gen(function* () {
        const result = yield* handleToken({ plain: true }).pipe(
          Effect.catchTag("AppError", (e) =>
            Effect.succeed({
              error: true,
              code: e.code,
              guidance: e.suggestions?.[0]?.description,
            }),
          ),
        );
        expect(result).toMatchObject({ error: true, code: "auth_required" });
      }),
    );
  });

  it.effect("fails with auth_required when persisted credentials are disabled", () => {
    const { provide } = makeLayers({ allowsPersistedCredentials: false });
    return provide(
      Effect.gen(function* () {
        const result = yield* handleToken({ plain: true }).pipe(
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
          code: "auth_required",
          guidance:
            "Set AXM_TOKEN_FILE (preferred) or AXM_TOKEN for non-interactive authentication.",
        });
      }),
    );
  });

  it.effect("shows the token in an interactive terminal without an output mode", () => {
    const { provide, rendererState } = makeLayers({ hasCredentials: true, nonInteractive: false });

    return provide(
      Effect.gen(function* () {
        yield* handleToken({});
        expect(rendererState.credentials).toEqual(["axm_ses_mytoken\n"]);
        expect(messages(rendererState)).toEqual([]);
      }),
    );
  });

  it.effect("refuses JSON token output before resolving a credential", () => {
    const { provide, rendererState } = makeLayers({ machine: true, json: true });

    return provide(
      Effect.gen(function* () {
        const failure = yield* handleToken({}).pipe(Effect.flip);
        expect(failure).toMatchObject({ code: "usage" });
        expect(rendererState.credentials).toEqual([]);
        expect(rendererState.results).toEqual([]);
      }),
    );
  });

  it.effect("outputs token from AXM_TOKEN env var", () => {
    const { provide, rendererState } = makeLayers({
      environment: { AXM_TOKEN: "axm_env_test_token" },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleToken({ plain: true });
        expect(rendererState.credentials).toEqual(["axm_env_test_token\n"]);
      }),
    );
  });

  it.effect("lists tokens", () => {
    const { provide, rendererState } = makeLayers({
      hasCredentials: true,
      authOverrides: {
        listTokens: () =>
          Effect.succeed({
            tokens: [
              {
                id: "token_123",
                name: "ci",
                type: "pat",
                permissions: {
                  model: "gat",
                  owners: ["@foo"],
                  extensions: [],
                  permission: "read",
                },
                createdAt: DateTime.makeUnsafe("2026-05-15T00:00:00.000Z"),
                expiresAt: DateTime.makeUnsafe("2026-06-15T00:00:00.000Z"),
                lastUsedAt: null,
              },
            ],
            hasMore: false,
            cursor: null,
          }),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleListTokens({});
        expect(tables(rendererState)[0]?.rows).toMatchObject([
          {
            ID: "token_123",
            Name: "ci",
            "Can do": "Read extensions — @foo",
            "Last used": "never",
          },
        ]);
      }),
    );
  });

  it.effect("emits token list count in machine mode", () => {
    const { provide, rendererState } = makeLayers({
      hasCredentials: true,
      machine: true,
      authOverrides: {
        listTokens: () =>
          Effect.succeed({
            tokens: [
              {
                id: "token_123",
                name: "ci",
                type: "pat",
                permissions: {
                  model: "gat",
                  owners: ["@foo"],
                  extensions: [],
                  permission: "read",
                },
                createdAt: DateTime.makeUnsafe("2026-05-15T00:00:00.000Z"),
                expiresAt: DateTime.makeUnsafe("2026-06-15T00:00:00.000Z"),
                lastUsedAt: null,
              },
            ],
            hasMore: false,
            cursor: null,
          }),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleListTokens({});

        expect(rendererState.results[0]?.data).toMatchObject({
          count: 1,
          items: [
            {
              id: "token_123",
              name: "ci",
            },
          ],
        });
        expectNoPlanEnvelope(rendererState.results[0]?.data);
      }),
    );
  });

  it.effect("emits a single empty list payload when no tokens exist", () => {
    const { provide, rendererState } = makeLayers({
      hasCredentials: true,
      authOverrides: {
        listTokens: () =>
          Effect.succeed({
            tokens: [],
            hasMore: false,
            cursor: null,
          }),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleListTokens({});

        expect(tables(rendererState)).toEqual([]);
        expect(messages(rendererState)).toEqual([{ _tag: "info", message: "No tokens found" }]);
        expect(rendererState.results[0]?.data).toMatchObject({
          count: 0,
          items: [],
        });
        expect(rendererState.docs.flatMap((entry) => entry.doc)).toContainEqual({
          _tag: "headline",
          tone: "neutral",
          text: "No tokens found",
        });
      }),
    );
  });

  it.effect("revokes a token by id", () => {
    const revoked: string[] = [];
    const { provide, rendererState } = makeLayers({
      hasCredentials: true,
      authOverrides: {
        deleteToken: (_endpoint, tokenId) => {
          revoked.push(tokenId);
          return Effect.void;
        },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleRevokeToken("token_123");
        expect(revoked).toEqual(["token_123"]);
        const result = expectRecord(
          property(expectRecord(rendererState.results[0]?.data), "result"),
        );
        expect(result).toEqual({
          status: "revoked",
          tokenId: "token_123",
        });
        expect(messages(rendererState)).toContainEqual({
          _tag: "success",
          message: "Revoked token token_123. It is refused on its next request.",
        });
        expect(rendererState.suggestions).toEqual([
          { description: "List remaining tokens", cmd: "axm token list" },
        ]);
      }),
    );
  });

  it.effect("emits structured JSON when revoking a token in machine mode", () => {
    const revoked: string[] = [];
    const { provide, rendererState } = makeLayers({
      hasCredentials: true,
      machine: true,
      authOverrides: {
        deleteToken: (_endpoint, tokenId) => {
          revoked.push(tokenId);
          return Effect.void;
        },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleRevokeToken("token_123");
        expect(revoked).toEqual(["token_123"]);
        expect(rendererState.results[0]?.data).toMatchObject({
          result: {
            status: "revoked",
            tokenId: "token_123",
          },
        });
        expect(messages(rendererState)).toEqual([]);
        expect(rendererState.suggestions).toEqual([
          { description: "List remaining tokens", cmd: "axm token list" },
        ]);
      }),
    );
  });
});
