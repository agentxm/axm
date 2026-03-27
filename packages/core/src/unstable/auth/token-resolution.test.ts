/**
 * Unit tests for token resolution precedence chain.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeAppError } from "../app-error/index.js";
import { AuthClientTest } from "./auth-client.js";
import { CredentialStore, CredentialStoreTest } from "./credential-store.js";
import {
  resolveToken,
  resolveStoredToken,
  resolveStoredTokenWithRefresh,
  resolveAmbientToken,
  resolveRequestToken,
  resetEnvVarMessageFlag,
} from "./token-resolution.js";

const REGISTRY_URL = "https://registry.agentxm.ai";
const futureExpiry = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const nearExpiry = () => new Date(Date.now() + 60 * 1000).toISOString();

const makeRuntimeLayer = (
  credentialData?: Parameters<typeof CredentialStoreTest>[1],
  authClientLayer = AuthClientTest(),
) => Layer.mergeAll(CredentialStoreTest("restricted-file", credentialData), authClientLayer);

describe("resolveToken", () => {
  let origAxmToken: string | undefined;

  beforeEach(() => {
    origAxmToken = process.env["AXM_TOKEN"];
    delete process.env["AXM_TOKEN"];
    resetEnvVarMessageFlag();
  });

  afterEach(() => {
    if (origAxmToken !== undefined) process.env["AXM_TOKEN"] = origAxmToken;
    else delete process.env["AXM_TOKEN"];
  });

  it("returns EnvVar token source when AXM_TOKEN is set", async () => {
    process.env["AXM_TOKEN"] = "axm_ses_env_token";
    const layer = makeRuntimeLayer();
    const result = await Effect.runPromise(resolveToken(REGISTRY_URL).pipe(Effect.provide(layer)));

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("EnvVar");
      expect(result.value.token).toBe("axm_ses_env_token");
    }
  });

  it("returns Flag token source when --token flag is provided", async () => {
    const layer = makeRuntimeLayer();
    const result = await Effect.runPromise(
      resolveToken(REGISTRY_URL, "axm_ses_flag_token").pipe(Effect.provide(layer)),
    );

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("Flag");
      expect(result.value.token).toBe("axm_ses_flag_token");
    }
  });

  it("returns CredentialStore token source when credentials exist", async () => {
    const layer = makeRuntimeLayer({
      version: 1,
      registries: {
        [REGISTRY_URL]: {
          accounts: {
            alice: {
              access_token: "axm_ses_stored",
              refresh_token: "axm_ref_stored",
              expires_at: futureExpiry(),
              active: true,
            },
          },
        },
      },
    });

    const result = await Effect.runPromise(resolveToken(REGISTRY_URL).pipe(Effect.provide(layer)));

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("CredentialStore");
      expect(result.value.token).toBe("axm_ses_stored");
    }
  });

  it("returns none when no token source is available", async () => {
    const layer = makeRuntimeLayer();
    const result = await Effect.runPromise(resolveToken(REGISTRY_URL).pipe(Effect.provide(layer)));

    expect(Option.isNone(result)).toBe(true);
  });

  it("AXM_TOKEN takes priority over --token flag", async () => {
    process.env["AXM_TOKEN"] = "axm_ses_env_priority";
    const layer = makeRuntimeLayer();
    const result = await Effect.runPromise(
      resolveToken(REGISTRY_URL, "axm_ses_flag_ignored").pipe(Effect.provide(layer)),
    );

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("EnvVar");
      expect(result.value.token).toBe("axm_ses_env_priority");
    }
  });

  it("--token flag takes priority over credential store", async () => {
    const layer = makeRuntimeLayer({
      version: 1,
      registries: {
        [REGISTRY_URL]: {
          accounts: {
            alice: {
              access_token: "axm_ses_stored_ignored",
              refresh_token: "axm_ref_stored",
              expires_at: futureExpiry(),
              active: true,
            },
          },
        },
      },
    });

    const result = await Effect.runPromise(
      resolveToken(REGISTRY_URL, "axm_ses_flag_priority").pipe(Effect.provide(layer)),
    );

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("Flag");
      expect(result.value.token).toBe("axm_ses_flag_priority");
    }
  });

  it("ignores empty AXM_TOKEN", async () => {
    process.env["AXM_TOKEN"] = "";
    const layer = makeRuntimeLayer();
    const result = await Effect.runPromise(
      resolveToken(REGISTRY_URL, "axm_ses_flag").pipe(Effect.provide(layer)),
    );

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("Flag");
    }
  });

  it("ignores empty --token flag", async () => {
    const layer = makeRuntimeLayer();
    const result = await Effect.runPromise(
      resolveToken(REGISTRY_URL, "").pipe(Effect.provide(layer)),
    );

    expect(Option.isNone(result)).toBe(true);
  });

  it("refreshes near-expiry stored credentials before returning them", async () => {
    const layer = makeRuntimeLayer(
      {
        version: 1,
        registries: {
          [REGISTRY_URL]: {
            accounts: {
              alice: {
                access_token: "axm_ses_old",
                refresh_token: "axm_ref_old",
                expires_at: nearExpiry(),
                active: true,
              },
            },
          },
        },
      },
      AuthClientTest({
        refreshToken: () =>
          Effect.succeed({
            access_token: "axm_ses_refreshed",
            refresh_token: "axm_ref_refreshed",
            expires_at: futureExpiry(),
          }),
      }),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const token = yield* resolveToken(REGISTRY_URL);
        const store = yield* CredentialStore;
        const stored = yield* store.load(REGISTRY_URL);
        return { token, stored };
      }).pipe(Effect.provide(layer)),
    );

    expect(Option.isSome(result.token)).toBe(true);
    if (Option.isSome(result.token)) {
      expect(result.token.value._tag).toBe("CredentialStore");
      expect(result.token.value.token).toBe("axm_ses_refreshed");
    }
    expect(result.stored._tag).toBe("Some");
    if (result.stored._tag === "Some") {
      expect(result.stored.value.access_token).toBe("axm_ses_refreshed");
      expect(result.stored.value.refresh_token).toBe("axm_ref_refreshed");
    }
  });

  it("fails with AUTH_REFRESH_FAILED when refresh of near-expiry credentials fails", async () => {
    const layer = makeRuntimeLayer(
      {
        version: 1,
        registries: {
          [REGISTRY_URL]: {
            accounts: {
              alice: {
                access_token: "axm_ses_old",
                refresh_token: "axm_ref_old",
                expires_at: nearExpiry(),
                active: true,
              },
            },
          },
        },
      },
      AuthClientTest({
        refreshToken: () =>
          Effect.fail(
            makeAppError({
              code: "AUTH_REFRESH_FAILED",
              what: "Token refresh request failed",
            }),
          ),
      }),
    );

    const result = await Effect.runPromise(
      resolveToken(REGISTRY_URL).pipe(Effect.provide(layer), Effect.result),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.code).toBe("AUTH_REFRESH_FAILED");
    }
  });
});

describe("resolveStoredToken", () => {
  it("returns stored credentials when they exist", async () => {
    const layer = CredentialStoreTest("restricted-file", {
      version: 1,
      registries: {
        [REGISTRY_URL]: {
          accounts: {
            alice: {
              access_token: "axm_ses_stored",
              refresh_token: "axm_ref_stored",
              expires_at: futureExpiry(),
              active: true,
            },
          },
        },
      },
    });

    const result = await Effect.runPromise(
      resolveStoredToken(REGISTRY_URL).pipe(Effect.provide(layer)),
    );

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("CredentialStore");
      expect(result.value.token).toBe("axm_ses_stored");
    }
  });

  it("returns none when no credentials exist", async () => {
    const layer = CredentialStoreTest();
    const result = await Effect.runPromise(
      resolveStoredToken(REGISTRY_URL).pipe(Effect.provide(layer)),
    );

    expect(Option.isNone(result)).toBe(true);
  });

  it("does not check AXM_TOKEN env var", async () => {
    process.env["AXM_TOKEN"] = "axm_ses_env_should_be_ignored";
    const layer = CredentialStoreTest();
    const result = await Effect.runPromise(
      resolveStoredToken(REGISTRY_URL).pipe(Effect.provide(layer)),
    );

    // Should return none — env var is not checked by resolveStoredToken
    expect(Option.isNone(result)).toBe(true);
    delete process.env["AXM_TOKEN"];
  });
});

describe("resolveStoredTokenWithRefresh", () => {
  it("uses the stale stored token when configured to tolerate refresh failure", async () => {
    const layer = makeRuntimeLayer(
      {
        version: 1,
        registries: {
          [REGISTRY_URL]: {
            accounts: {
              alice: {
                access_token: "axm_ses_stale",
                refresh_token: "axm_ref_stale",
                expires_at: nearExpiry(),
                active: true,
              },
            },
          },
        },
      },
      AuthClientTest({
        refreshToken: () =>
          Effect.fail(
            makeAppError({
              code: "AUTH_REFRESH_FAILED",
              what: "Token refresh request failed",
            }),
          ),
      }),
    );

    const result = await Effect.runPromise(
      resolveStoredTokenWithRefresh(REGISTRY_URL, {
        onRefreshFailure: "use-stale",
      }).pipe(Effect.provide(layer)),
    );

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("CredentialStore");
      expect(result.value.token).toBe("axm_ses_stale");
    }
  });
});

describe("resolveAmbientToken", () => {
  let origAxmToken: string | undefined;

  beforeEach(() => {
    origAxmToken = process.env["AXM_TOKEN"];
    delete process.env["AXM_TOKEN"];
    resetEnvVarMessageFlag();
  });

  afterEach(() => {
    if (origAxmToken !== undefined) process.env["AXM_TOKEN"] = origAxmToken;
    else delete process.env["AXM_TOKEN"];
  });

  it("returns EnvVar token when AXM_TOKEN is set", async () => {
    process.env["AXM_TOKEN"] = "axm_ses_env_ambient";
    const result = await Effect.runPromise(resolveAmbientToken());

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("EnvVar");
      expect(result.value.token).toBe("axm_ses_env_ambient");
    }
  });

  it("returns Flag token when flagToken is provided", async () => {
    const result = await Effect.runPromise(resolveAmbientToken("axm_ses_flag_ambient"));

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("Flag");
      expect(result.value.token).toBe("axm_ses_flag_ambient");
    }
  });

  it("returns none when neither is available", async () => {
    const result = await Effect.runPromise(resolveAmbientToken());

    expect(Option.isNone(result)).toBe(true);
  });

  it("AXM_TOKEN takes priority over flag", async () => {
    process.env["AXM_TOKEN"] = "axm_ses_env_priority";
    const result = await Effect.runPromise(resolveAmbientToken("axm_ses_flag_ignored"));

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("EnvVar");
      expect(result.value.token).toBe("axm_ses_env_priority");
    }
  });

  it("does not access credential store (no CredentialStore layer needed)", async () => {
    // resolveAmbientToken does not require CredentialStore
    const result = await Effect.runPromise(resolveAmbientToken());

    expect(Option.isNone(result)).toBe(true);
  });
});

describe("resolveRequestToken", () => {
  let origAxmToken: string | undefined;

  beforeEach(() => {
    origAxmToken = process.env["AXM_TOKEN"];
    delete process.env["AXM_TOKEN"];
    resetEnvVarMessageFlag();
  });

  afterEach(() => {
    if (origAxmToken !== undefined) process.env["AXM_TOKEN"] = origAxmToken;
    else delete process.env["AXM_TOKEN"];
  });

  it("prefers AXM_TOKEN for requests to the default registry", async () => {
    process.env["AXM_TOKEN"] = "axm_ses_env";
    const layer = makeRuntimeLayer({
      version: 1,
      registries: {
        [REGISTRY_URL]: {
          accounts: {
            alice: {
              access_token: "axm_ses_stored",
              refresh_token: "axm_ref_stored",
              expires_at: futureExpiry(),
              active: true,
            },
          },
        },
      },
    });

    const result = await Effect.runPromise(
      resolveRequestToken(`${REGISTRY_URL}/v1/extensions`, REGISTRY_URL).pipe(
        Effect.provide(layer),
      ),
    );

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("EnvVar");
      expect(result.value.token).toBe("axm_ses_env");
    }
  });

  it("does not apply AXM_TOKEN to non-default registry requests", async () => {
    process.env["AXM_TOKEN"] = "axm_ses_env";
    const result = await Effect.runPromise(
      resolveRequestToken("https://other-registry.example.com/v1/extensions", REGISTRY_URL).pipe(
        Effect.provide(makeRuntimeLayer()),
      ),
    );

    expect(Option.isNone(result)).toBe(true);
  });

  it("falls back to stored credentials for non-default registry requests", async () => {
    const otherRegistryUrl = "https://other-registry.example.com";
    const layer = makeRuntimeLayer({
      version: 1,
      registries: {
        [otherRegistryUrl]: {
          accounts: {
            bob: {
              access_token: "axm_ses_other",
              refresh_token: "axm_ref_other",
              expires_at: futureExpiry(),
              active: true,
            },
          },
        },
      },
    });

    const result = await Effect.runPromise(
      resolveRequestToken(`${otherRegistryUrl}/v1/extensions`, REGISTRY_URL).pipe(
        Effect.provide(layer),
      ),
    );

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("CredentialStore");
      expect(result.value.token).toBe("axm_ses_other");
    }
  });

  it("uses the stale stored token when request-time proactive refresh fails", async () => {
    const otherRegistryUrl = "https://other-registry.example.com";
    const layer = makeRuntimeLayer(
      {
        version: 1,
        registries: {
          [otherRegistryUrl]: {
            accounts: {
              bob: {
                access_token: "axm_ses_stale",
                refresh_token: "axm_ref_stale",
                expires_at: nearExpiry(),
                active: true,
              },
            },
          },
        },
      },
      AuthClientTest({
        refreshToken: () =>
          Effect.fail(
            makeAppError({
              code: "AUTH_REFRESH_FAILED",
              what: "Token refresh request failed",
            }),
          ),
      }),
    );

    const result = await Effect.runPromise(
      resolveRequestToken(`${otherRegistryUrl}/v1/extensions`, REGISTRY_URL).pipe(
        Effect.provide(layer),
      ),
    );

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("CredentialStore");
      expect(result.value.token).toBe("axm_ses_stale");
    }
  });
});
