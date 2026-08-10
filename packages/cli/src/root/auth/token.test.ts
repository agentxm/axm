/**
 * Unit tests for the auth token command handler.
 */

import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import {
  AuthClientTest,
  AuthLoginInteractionTest,
  CredentialStoreTest,
  RegistryUrl,
} from "@agentxm/client-core/unstable/auth";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { normalizeHandle } from "@agentxm/client-core/unstable/extensions";
import { TestMachineRenderer, TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { expectAppliedPlanResult, expectNoPlanEnvelope } from "../../test-helpers.js";
import {
  handleCreateToken,
  handleListTokens,
  handleRevokeToken,
  handleToken,
  parseExpiresInSeconds,
} from "./token.js";

const REGISTRY_URL = "https://registry.agentxm.ai";
const ALICE = normalizeHandle("@alice");

const makeLayers = (opts?: {
  hasCredentials?: boolean;
  machine?: boolean;
  json?: boolean;
  nonInteractive?: boolean;
  allowsPersistedCredentials?: boolean;
  authOverrides?: Parameters<typeof AuthClientTest>[0];
}) => {
  const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
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

  const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);

  const FullLayer = Layer.mergeAll(
    rendererLayer,
    TestFlagsLayer({
      ...(opts?.json !== undefined && { json: opts.json }),
      ...(opts?.nonInteractive !== undefined && { nonInteractive: opts.nonInteractive }),
    }),
    credStoreLayer,
    AuthClientTest(opts?.authOverrides),
    interaction.layer,
    registryUrlLayer,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
  const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
    effect.pipe(Effect.provide(FullLayer));

  return { provide, rendererState, interactionState: interaction.state };
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

  it.effect("fails with auth_required when no token", () => {
    const { provide } = makeLayers();
    return provide(
      Effect.gen(function* () {
        const result = yield* handleToken().pipe(
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
        const result = yield* handleToken().pipe(
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
          guidance: "Set AXM_TOKEN or AXM_TOKEN_FILE for non-interactive authentication.",
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
          data: { token: "axm_ses_mytoken" },
        });
        expectNoPlanEnvelope(rendererState.results[0]?.data);
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

  it.effect("parses relative expiry durations", () =>
    Effect.gen(function* () {
      const sevenDays = yield* parseExpiresInSeconds("7d");
      const oneYear = yield* parseExpiresInSeconds("1y");

      expect(sevenDays).toBe(604800);
      expect(oneYear).toBe(31536000);
    }),
  );

  it.effect("creates a token with structured permissions", () => {
    const createCalls: Array<unknown> = [];
    const { provide, rendererState } = makeLayers({
      hasCredentials: true,
      authOverrides: {
        createToken: (_accessToken, params) => {
          createCalls.push(params);
          return Effect.succeed({
            id: "token_123",
            token: "axmt_created",
            name: params.name,
            scopes: ["extensions:read", "extensions:publish:new"],
            permissions: { kind: "gat" },
            createdAt: DateTime.makeUnsafe("2026-05-15T00:00:00.000Z"),
            expiresAt: DateTime.makeUnsafe("2026-06-14T00:00:00.000Z"),
          });
        },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleCreateToken({
          name: "ci",
          expires: "30d",
          owners: ["@foo"],
          extensions: [],
          permission: Option.some("publish"),
          orgPermission: Option.none(),
          cidr: ["203.0.113.0/24"],
          bypassMfa: true,
        });

        expect(createCalls).toMatchObject([
          {
            name: "ci",
            expiresIn: 2592000,
            permissions: {
              owners: ["@foo"],
              permission: "publish",
              cidr: ["203.0.113.0/24"],
              bypass_mfa: true,
            },
          },
        ]);
        expect(rendererState.details[0]?.item).toMatchObject({
          id: "token_123",
          token: "axmt_created",
        });
        expect(rendererState.suggestions).toEqual([
          { description: "List tokens", cmd: "axm token list" },
          { description: "Revoke this token", cmd: "axm token revoke token_123" },
        ]);
      }),
    );
  });

  it.effect("completes step-up before creating a privileged token", () => {
    const createCalls: Array<unknown> = [];
    const { provide, rendererState, interactionState } = makeLayers({
      hasCredentials: true,
      nonInteractive: false,
      authOverrides: {
        createToken: (_accessToken, params, options) => {
          createCalls.push({ params, options });
          if (options?.stepUpRequestId === undefined) {
            return Effect.fail(
              makeAppError({
                code: "auth_required",
                detail: "Step-up authentication is required",
                metadata: {
                  response: {
                    status: 401,
                    body: {
                      code: "eotp",
                      max_age: 300,
                      step_up: {
                        request_id: "step_01h455vb4pexka56gq5w2r7cpc",
                        verification_url:
                          "https://agentxm.ai/step-up/step_01h455vb4pexka56gq5w2r7cpc",
                        status_url:
                          "https://registry.agentxm.ai/v1/auth/step-up/requests/step_01h455vb4pexka56gq5w2r7cpc",
                        expires_at: "2026-08-10T16:05:00.000Z",
                        interval: 2,
                        action: "Create access token",
                        target: "ci-admin",
                      },
                    },
                  },
                },
              }),
            );
          }
          return Effect.succeed({
            id: "token_123",
            token: "axmt_created",
            name: params.name,
            scopes: ["extensions:admin"],
            permissions: { kind: "gat" },
            createdAt: DateTime.makeUnsafe("2026-05-15T00:00:00.000Z"),
            expiresAt: DateTime.makeUnsafe("2026-06-14T00:00:00.000Z"),
          });
        },
        waitForStepUpRequest: () => Effect.void,
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleCreateToken({
          name: "ci-admin",
          expires: "30d",
          owners: [],
          extensions: [],
          permission: Option.some("admin"),
          orgPermission: Option.none(),
          cidr: [],
          bypassMfa: false,
        });

        expect(interactionState.openBrowserCalls).toEqual([
          "https://agentxm.ai/step-up/step_01h455vb4pexka56gq5w2r7cpc",
        ]);
        expect(createCalls).toMatchObject([
          { options: undefined },
          { options: { stepUpRequestId: "step_01h455vb4pexka56gq5w2r7cpc" } },
        ]);
        expect(rendererState.details[0]?.item).toMatchObject({
          id: "token_123",
          token: "axmt_created",
        });
      }),
    );
  });

  it.effect("emits create token suggestions in machine mode", () => {
    const { provide, rendererState } = makeLayers({
      hasCredentials: true,
      machine: true,
      authOverrides: {
        createToken: (_accessToken, params) =>
          Effect.succeed({
            id: "token_123",
            token: "axmt_created",
            name: params.name,
            scopes: ["extensions:read"],
            permissions: { kind: "gat" },
            createdAt: DateTime.makeUnsafe("2026-05-15T00:00:00.000Z"),
            expiresAt: DateTime.makeUnsafe("2026-06-14T00:00:00.000Z"),
          }),
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleCreateToken({
          name: "ci",
          expires: "30d",
          owners: [],
          extensions: [],
          permission: Option.some("read"),
          orgPermission: Option.none(),
          cidr: [],
          bypassMfa: false,
        });

        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Create AXM access token",
        });
        expect(rendererState.results[0]?.data).toMatchObject({
          data: {
            id: "token_123",
            token: "axmt_created",
          },
        });
        expect(result).toMatchObject({
          steps: [
            {
              label: "Registry access token",
              status: "applied",
              artifact: {
                path: "token_123",
                scope: "user",
                change: "created",
              },
            },
          ],
          status: "created",
          tokenId: "token_123",
          name: "ci",
        });
        expect(rendererState.details).toEqual([]);
        expect(rendererState.suggestions).toEqual([
          { description: "List tokens", cmd: "axm token list" },
          { description: "Revoke this token", cmd: "axm token revoke token_123" },
        ]);
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
                scopes: ["extensions:read"],
                permissions: null,
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
        yield* handleListTokens();
        expect(rendererState.tables[0]?.items).toMatchObject([
          {
            id: "token_123",
            name: "ci",
            lastUsedAt: "never",
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
                scopes: ["extensions:read"],
                permissions: null,
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
        yield* handleListTokens();

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
        yield* handleListTokens();

        expect(rendererState.tables).toEqual([]);
        expect(rendererState.logs).toEqual([]);
        expect(rendererState.results[0]?.data).toMatchObject({
          count: 0,
          items: [],
        });
        expect(rendererState.results[1]?.data).toMatchObject({
          count: 0,
          items: [],
          emptyMessage: "No tokens found",
        });
      }),
    );
  });

  it.effect("revokes a token by id", () => {
    const revoked: string[] = [];
    const { provide, rendererState } = makeLayers({
      hasCredentials: true,
      authOverrides: {
        deleteToken: (_accessToken, tokenId) => {
          revoked.push(tokenId);
          return Effect.void;
        },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleRevokeToken("token_123");
        expect(revoked).toEqual(["token_123"]);
        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Revoke AXM access token",
        });
        expect(result).toMatchObject({
          steps: [
            {
              label: "Registry access token",
              status: "applied",
              artifact: {
                path: "token_123",
                scope: "user",
                change: "removed",
              },
            },
          ],
          status: "revoked",
          tokenId: "token_123",
          stepUpCompleted: false,
        });
        expect(rendererState.logs).toContainEqual({
          _tag: "success",
          message: "Revoked token token_123.",
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
        deleteToken: (_accessToken, tokenId) => {
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
            stepUpCompleted: false,
          },
        });
        expect(rendererState.logs).toEqual([]);
        expect(rendererState.suggestions).toEqual([
          { description: "List remaining tokens", cmd: "axm token list" },
        ]);
      }),
    );
  });

  it.effect("completes step-up before retrying token revoke", () => {
    const deleteCalls: Array<unknown> = [];
    const { provide, rendererState, interactionState } = makeLayers({
      hasCredentials: true,
      nonInteractive: false,
      authOverrides: {
        deleteToken: (_accessToken, tokenId, options) => {
          deleteCalls.push({ tokenId, options });
          if (options?.stepUpRequestId === undefined) {
            return Effect.fail(
              makeAppError({
                code: "auth",
                detail: "Step-up authentication is required",
                metadata: {
                  response: {
                    status: 401,
                    body: {
                      code: "eotp",
                      max_age: 300,
                      step_up: {
                        request_id: "step_01h455vb4pexka56gq5w2r7cpc",
                        verification_url:
                          "https://agentxm.ai/step-up/step_01h455vb4pexka56gq5w2r7cpc",
                        status_url:
                          "https://registry.agentxm.ai/v1/auth/step-up/requests/step_01h455vb4pexka56gq5w2r7cpc",
                        expires_at: "2026-08-10T16:05:00.000Z",
                        interval: 2,
                        action: "Revoke access token",
                        target: "token_123",
                      },
                    },
                  },
                },
              }),
            );
          }
          return Effect.void;
        },
        waitForStepUpRequest: () => Effect.void,
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleRevokeToken("token_123");

        expect(interactionState.openBrowserCalls).toEqual([
          "https://agentxm.ai/step-up/step_01h455vb4pexka56gq5w2r7cpc",
        ]);
        expect(deleteCalls).toMatchObject([
          { tokenId: "token_123", options: undefined },
          {
            tokenId: "token_123",
            options: {
              stepUpRequestId: "step_01h455vb4pexka56gq5w2r7cpc",
            },
          },
        ]);
        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Revoke AXM access token",
        });
        expect(result).toMatchObject({
          steps: [
            {
              label: "Registry access token",
              status: "applied",
              artifact: {
                path: "token_123",
                scope: "user",
                change: "removed",
              },
            },
          ],
          status: "revoked",
          tokenId: "token_123",
          stepUpCompleted: true,
        });
        expect(rendererState.logs).toContainEqual({
          _tag: "success",
          message: "Revoked token token_123.",
        });
        expect(rendererState.suggestions).toEqual([
          { description: "List remaining tokens", cmd: "axm token list" },
        ]);
      }),
    );
  });

  it.effect("emits actionable step-up instructions without opening a browser in JSON mode", () => {
    const deleteCalls: Array<unknown> = [];
    const { provide, rendererState, interactionState } = makeLayers({
      hasCredentials: true,
      machine: true,
      json: true,
      nonInteractive: true,
      authOverrides: {
        deleteToken: (_accessToken, tokenId, options) => {
          deleteCalls.push({ tokenId, options });
          if (options?.stepUpRequestId === undefined) {
            return Effect.fail(
              makeAppError({
                code: "auth",
                detail: "Step-up authentication is required",
                metadata: {
                  response: {
                    status: 401,
                    body: {
                      code: "eotp",
                      max_age: 300,
                      step_up: {
                        request_id: "step_01h455vb4pexka56gq5w2r7cpc",
                        verification_url:
                          "https://agentxm.ai/step-up/step_01h455vb4pexka56gq5w2r7cpc",
                        status_url:
                          "https://registry.agentxm.ai/v1/auth/step-up/requests/step_01h455vb4pexka56gq5w2r7cpc",
                        expires_at: "2026-08-10T16:05:00.000Z",
                        interval: 2,
                        action: "Revoke access token",
                        target: "token_123",
                      },
                    },
                  },
                },
              }),
            );
          }
          return Effect.void;
        },
        waitForStepUpRequest: () => Effect.void,
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleRevokeToken("token_123");

        expect(interactionState.openBrowserCalls).toEqual([]);
        expect(deleteCalls).toMatchObject([
          { tokenId: "token_123", options: undefined },
          {
            tokenId: "token_123",
            options: {
              stepUpRequestId: "step_01h455vb4pexka56gq5w2r7cpc",
            },
          },
        ]);
        expect(rendererState.results[0]?.data).toMatchObject({
          result: {
            status: "revoked",
            tokenId: "token_123",
            stepUpCompleted: true,
          },
        });
        expect(rendererState.logs).toEqual(
          expect.arrayContaining([
            { _tag: "info", message: "Action: Revoke access token" },
            { _tag: "info", message: "Target: token_123" },
            {
              _tag: "info",
              message: "Verify at: https://agentxm.ai/step-up/step_01h455vb4pexka56gq5w2r7cpc",
            },
            {
              _tag: "info",
              message: "If verification expires or is cancelled, rerun the command to restart.",
            },
          ]),
        );
        expect(rendererState.suggestions).toEqual([
          { description: "List remaining tokens", cmd: "axm token list" },
        ]);
      }),
    );
  });
});
