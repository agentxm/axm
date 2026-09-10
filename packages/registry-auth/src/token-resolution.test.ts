/**
 * Unit tests for token resolution precedence chain.
 */

import { describe, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { afterEach, beforeEach, expect } from "vitest";

import { AuthClientTest } from "./auth-client.js";
import { CredentialStoreTest } from "./credential-store.js";
import { CredentialFileSchema } from "./schema.js";
import {
  resolveRequiredToken,
  resolveToken,
  resolveStoredToken,
  resolveAmbientToken,
  resolveRequestToken,
} from "./token-resolution.js";

const REGISTRY_URL = "https://registry.agentxm.ai";
const futureExpiry = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const nearExpiry = () => new Date(Date.now() + 60 * 1000).toISOString();

const makeCredentialFile = (registries: Record<string, unknown>) =>
  Schema.decodeUnknownSync(CredentialFileSchema)({
    version: 1 as const,
    registries,
  });

const makeRuntimeLayer = (
  credentialData?: Parameters<typeof CredentialStoreTest>[1],
  authClientLayer = AuthClientTest(),
  allowsPersistedCredentials?: boolean,
) =>
  Layer.mergeAll(
    CredentialStoreTest("restricted-file", credentialData, allowsPersistedCredentials),
    authClientLayer,
    NodeServices.layer,
  );

describe("resolveToken", () => {
  let origAxmToken: string | undefined;
  let origAxmTokenFile: string | undefined;

  beforeEach(() => {
    origAxmToken = process.env["AXM_TOKEN"];
    origAxmTokenFile = process.env["AXM_TOKEN_FILE"];
    delete process.env["AXM_TOKEN"];
    delete process.env["AXM_TOKEN_FILE"];
  });

  afterEach(() => {
    if (origAxmToken !== undefined) process.env["AXM_TOKEN"] = origAxmToken;
    else delete process.env["AXM_TOKEN"];
    if (origAxmTokenFile !== undefined) process.env["AXM_TOKEN_FILE"] = origAxmTokenFile;
    else delete process.env["AXM_TOKEN_FILE"];
  });

  it.effect("returns EnvVar token source when AXM_TOKEN is set", () => {
    process.env["AXM_TOKEN"] = "axm_ses_env_token";
    const layer = makeRuntimeLayer();
    return Effect.gen(function* () {
      const result = yield* resolveToken(REGISTRY_URL);
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("EnvVar");
        expect(result.value.token).toBe("axm_ses_env_token");
      }
    }).pipe(Effect.provide(layer));
  });

  it.effect("returns Flag token source when --token flag is provided", () => {
    const layer = makeRuntimeLayer();
    return Effect.gen(function* () {
      const result = yield* resolveToken(REGISTRY_URL, "axm_ses_flag_token");
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("Flag");
        expect(result.value.token).toBe("axm_ses_flag_token");
      }
    }).pipe(Effect.provide(layer));
  });

  it.effect("reads and trims AXM_TOKEN_FILE without exposing it as an env token", () => {
    const directory = mkdtempSync(join(tmpdir(), "axm-token-file-"));
    const tokenPath = join(directory, "token");
    writeFileSync(tokenPath, "axm_pat_file_token\n", { mode: 0o600 });
    process.env["AXM_TOKEN_FILE"] = tokenPath;
    const layer = makeRuntimeLayer();
    return Effect.gen(function* () {
      const result = yield* resolveToken(REGISTRY_URL);
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("File");
        expect(result.value.token).toBe("axm_pat_file_token");
      }
    }).pipe(
      Effect.ensuring(Effect.sync(() => rmSync(directory, { recursive: true, force: true }))),
      Effect.provide(layer),
    );
  });

  it.effect("keeps AXM_TOKEN ahead of AXM_TOKEN_FILE", () => {
    const directory = mkdtempSync(join(tmpdir(), "axm-token-file-"));
    const tokenPath = join(directory, "token");
    writeFileSync(tokenPath, "axm_pat_file_token\n", { mode: 0o600 });
    process.env["AXM_TOKEN"] = "axm_pat_env_token";
    process.env["AXM_TOKEN_FILE"] = tokenPath;
    const layer = makeRuntimeLayer();
    return Effect.gen(function* () {
      const result = yield* resolveToken(REGISTRY_URL);
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) expect(result.value._tag).toBe("EnvVar");
    }).pipe(
      Effect.ensuring(Effect.sync(() => rmSync(directory, { recursive: true, force: true }))),
      Effect.provide(layer),
    );
  });

  it.effect("returns CredentialStore token source when credentials exist", () => {
    const layer = makeRuntimeLayer(
      makeCredentialFile({
        [REGISTRY_URL]: {
          accounts: {
            "@alice": {
              access_token: "axm_ses_stored",
              refresh_token: "axm_ref_stored",
              expires_at: futureExpiry(),
              active: true,
            },
          },
        },
      }),
    );

    return Effect.gen(function* () {
      const result = yield* resolveToken(REGISTRY_URL);
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("CredentialStore");
        expect(result.value.token).toBe("axm_ses_stored");
      }
    }).pipe(Effect.provide(layer));
  });

  it.effect("returns none when no token source is available", () => {
    const layer = makeRuntimeLayer();
    return Effect.gen(function* () {
      const result = yield* resolveToken(REGISTRY_URL);
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect("AXM_TOKEN takes priority over --token flag", () => {
    process.env["AXM_TOKEN"] = "axm_ses_env_priority";
    const layer = makeRuntimeLayer();
    return Effect.gen(function* () {
      const result = yield* resolveToken(REGISTRY_URL, "axm_ses_flag_ignored");
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("EnvVar");
        expect(result.value.token).toBe("axm_ses_env_priority");
      }
    }).pipe(Effect.provide(layer));
  });

  it.effect("--token flag takes priority over credential store", () => {
    const layer = makeRuntimeLayer(
      makeCredentialFile({
        [REGISTRY_URL]: {
          accounts: {
            "@alice": {
              access_token: "axm_ses_stored_ignored",
              refresh_token: "axm_ref_stored",
              expires_at: futureExpiry(),
              active: true,
            },
          },
        },
      }),
    );

    return Effect.gen(function* () {
      const result = yield* resolveToken(REGISTRY_URL, "axm_ses_flag_priority");
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("Flag");
        expect(result.value.token).toBe("axm_ses_flag_priority");
      }
    }).pipe(Effect.provide(layer));
  });

  it.effect("ignores empty AXM_TOKEN", () => {
    process.env["AXM_TOKEN"] = "";
    const layer = makeRuntimeLayer();
    return Effect.gen(function* () {
      const result = yield* resolveToken(REGISTRY_URL, "axm_ses_flag");
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("Flag");
      }
    }).pipe(Effect.provide(layer));
  });

  it.effect("ignores empty --token flag", () => {
    const layer = makeRuntimeLayer();
    return Effect.gen(function* () {
      const result = yield* resolveToken(REGISTRY_URL, "");
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect("returns near-expiry stored credentials without proactive refresh", () => {
    const layer = makeRuntimeLayer(
      makeCredentialFile({
        [REGISTRY_URL]: {
          accounts: {
            "@alice": {
              access_token: "axm_ses_old",
              refresh_token: "axm_ref_old",
              expires_at: nearExpiry(),
              active: true,
            },
          },
        },
      }),
    );

    return Effect.gen(function* () {
      const result = yield* resolveToken(REGISTRY_URL);
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("CredentialStore");
        expect(result.value.token).toBe("axm_ses_old");
      }
    }).pipe(Effect.provide(layer));
  });
});

describe("resolveRequiredToken", () => {
  it.effect("returns the resolved token when one is available", () => {
    const layer = makeRuntimeLayer(
      makeCredentialFile({
        [REGISTRY_URL]: {
          accounts: {
            "@alice": {
              access_token: "axm_ses_stored",
              refresh_token: "axm_ref_stored",
              expires_at: futureExpiry(),
              active: true,
            },
          },
        },
      }),
    );

    return Effect.gen(function* () {
      const result = yield* resolveRequiredToken(REGISTRY_URL);
      expect(result._tag).toBe("CredentialStore");
      expect(result.token).toBe("axm_ses_stored");
    }).pipe(Effect.provide(layer));
  });

  it.effect("returns a non-circular human handoff when no token is available", () => {
    const layer = makeRuntimeLayer();
    return Effect.gen(function* () {
      const error = yield* Effect.flip(resolveRequiredToken(REGISTRY_URL));
      expect(error._tag).toBe("AuthLoginRequired");
      if (error._tag !== "AuthLoginRequired") throw new Error("Expected AuthLoginRequired");
      expect(error.message).toBe("Authentication required");
    }).pipe(Effect.provide(layer));
  });

  it.effect("offers token-file recovery when persisted credentials are disabled", () => {
    const layer = makeRuntimeLayer(undefined, AuthClientTest(), false);
    return Effect.gen(function* () {
      const error = yield* Effect.flip(resolveRequiredToken(REGISTRY_URL));
      expect(error._tag).toBe("AuthTokenPolicyRequired");
    }).pipe(Effect.provide(layer));
  });
});

describe("resolveStoredToken", () => {
  let origAxmToken: string | undefined;

  beforeEach(() => {
    origAxmToken = process.env["AXM_TOKEN"];
    delete process.env["AXM_TOKEN"];
  });

  afterEach(() => {
    if (origAxmToken !== undefined) process.env["AXM_TOKEN"] = origAxmToken;
    else delete process.env["AXM_TOKEN"];
  });

  it.effect("returns stored credentials when they exist", () => {
    const layer = CredentialStoreTest(
      "restricted-file",
      makeCredentialFile({
        [REGISTRY_URL]: {
          accounts: {
            "@alice": {
              access_token: "axm_ses_stored",
              refresh_token: "axm_ref_stored",
              expires_at: futureExpiry(),
              active: true,
            },
          },
        },
      }),
    );

    return Effect.gen(function* () {
      const result = yield* resolveStoredToken(REGISTRY_URL);
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("CredentialStore");
        expect(result.value.token).toBe("axm_ses_stored");
      }
    }).pipe(Effect.provide(layer));
  });

  it.effect("returns none when no credentials exist", () => {
    const layer = CredentialStoreTest();
    return Effect.gen(function* () {
      const result = yield* resolveStoredToken(REGISTRY_URL);
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect("does not check AXM_TOKEN env var", () => {
    process.env["AXM_TOKEN"] = "axm_ses_env_should_be_ignored";
    const layer = CredentialStoreTest();
    return Effect.gen(function* () {
      const result = yield* resolveStoredToken(REGISTRY_URL);
      // Should return none — env var is not checked by resolveStoredToken
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect("returns none when persisted credentials are disabled", () => {
    const layer = CredentialStoreTest(
      "restricted-file",
      makeCredentialFile({
        [REGISTRY_URL]: {
          accounts: {
            "@alice": {
              access_token: "axm_ses_stored",
              refresh_token: "axm_ref_stored",
              expires_at: futureExpiry(),
              active: true,
            },
          },
        },
      }),
      false,
    );

    return Effect.gen(function* () {
      const result = yield* resolveStoredToken(REGISTRY_URL);
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(layer));
  });
});

describe("resolveAmbientToken", () => {
  let origAxmToken: string | undefined;

  beforeEach(() => {
    origAxmToken = process.env["AXM_TOKEN"];
    delete process.env["AXM_TOKEN"];
  });

  afterEach(() => {
    if (origAxmToken !== undefined) process.env["AXM_TOKEN"] = origAxmToken;
    else delete process.env["AXM_TOKEN"];
  });

  it.effect("returns EnvVar token when AXM_TOKEN is set", () => {
    process.env["AXM_TOKEN"] = "axm_ses_env_ambient";
    return Effect.gen(function* () {
      const result = yield* resolveAmbientToken();
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("EnvVar");
        expect(result.value.token).toBe("axm_ses_env_ambient");
      }
    });
  });

  it.effect("returns Flag token when flagToken is provided", () =>
    Effect.gen(function* () {
      const result = yield* resolveAmbientToken("axm_ses_flag_ambient");
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("Flag");
        expect(result.value.token).toBe("axm_ses_flag_ambient");
      }
    }),
  );

  it.effect("returns none when neither is available", () =>
    Effect.gen(function* () {
      const result = yield* resolveAmbientToken();
      expect(Option.isNone(result)).toBe(true);
    }),
  );

  it.effect("AXM_TOKEN takes priority over flag", () => {
    process.env["AXM_TOKEN"] = "axm_ses_env_priority";
    return Effect.gen(function* () {
      const result = yield* resolveAmbientToken("axm_ses_flag_ignored");
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("EnvVar");
        expect(result.value.token).toBe("axm_ses_env_priority");
      }
    });
  });

  it.effect("does not access credential store (no CredentialStore layer needed)", () =>
    Effect.gen(function* () {
      // resolveAmbientToken does not require CredentialStore
      const result = yield* resolveAmbientToken();
      expect(Option.isNone(result)).toBe(true);
    }),
  );
});

describe("resolveRequestToken", () => {
  let origAxmToken: string | undefined;

  beforeEach(() => {
    origAxmToken = process.env["AXM_TOKEN"];
    delete process.env["AXM_TOKEN"];
  });

  afterEach(() => {
    if (origAxmToken !== undefined) process.env["AXM_TOKEN"] = origAxmToken;
    else delete process.env["AXM_TOKEN"];
  });

  it.effect("prefers AXM_TOKEN for requests to the default registry", () => {
    process.env["AXM_TOKEN"] = "axm_ses_env";
    const layer = makeRuntimeLayer(
      makeCredentialFile({
        [REGISTRY_URL]: {
          accounts: {
            "@alice": {
              access_token: "axm_ses_stored",
              refresh_token: "axm_ref_stored",
              expires_at: futureExpiry(),
              active: true,
            },
          },
        },
      }),
    );

    return Effect.gen(function* () {
      const result = yield* resolveRequestToken(`${REGISTRY_URL}/v1/extensions`, REGISTRY_URL);
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("EnvVar");
        expect(result.value.token).toBe("axm_ses_env");
      }
    }).pipe(Effect.provide(layer));
  });

  it.effect("does not apply AXM_TOKEN to non-default registry requests", () => {
    process.env["AXM_TOKEN"] = "axm_ses_env";
    return Effect.gen(function* () {
      const result = yield* resolveRequestToken(
        "https://other-registry.example.com/v1/extensions",
        REGISTRY_URL,
      );
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(makeRuntimeLayer()));
  });

  it.effect("falls back to stored credentials for non-default registry requests", () => {
    const otherRegistryUrl = "https://other-registry.example.com";
    const layer = makeRuntimeLayer(
      makeCredentialFile({
        [otherRegistryUrl]: {
          accounts: {
            "@bob": {
              access_token: "axm_ses_other",
              refresh_token: "axm_ref_other",
              expires_at: futureExpiry(),
              active: true,
            },
          },
        },
      }),
    );

    return Effect.gen(function* () {
      const result = yield* resolveRequestToken(`${otherRegistryUrl}/v1/extensions`, REGISTRY_URL);
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("CredentialStore");
        expect(result.value.token).toBe("axm_ses_other");
      }
    }).pipe(Effect.provide(layer));
  });

  it.effect("does not use stored credentials when persisted credentials are disabled", () => {
    const otherRegistryUrl = "https://other-registry.example.com";
    const layer = makeRuntimeLayer(
      makeCredentialFile({
        [otherRegistryUrl]: {
          accounts: {
            "@bob": {
              access_token: "axm_ses_other",
              refresh_token: "axm_ref_other",
              expires_at: futureExpiry(),
              active: true,
            },
          },
        },
      }),
      AuthClientTest(),
      false,
    );

    return Effect.gen(function* () {
      const result = yield* resolveRequestToken(`${otherRegistryUrl}/v1/extensions`, REGISTRY_URL);
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect("returns near-expiry stored credentials without proactive refresh", () => {
    const otherRegistryUrl = "https://other-registry.example.com";
    const layer = makeRuntimeLayer(
      makeCredentialFile({
        [otherRegistryUrl]: {
          accounts: {
            "@bob": {
              access_token: "axm_ses_near_expiry",
              refresh_token: "axm_ref_near_expiry",
              expires_at: nearExpiry(),
              active: true,
            },
          },
        },
      }),
    );

    return Effect.gen(function* () {
      const result = yield* resolveRequestToken(`${otherRegistryUrl}/v1/extensions`, REGISTRY_URL);
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("CredentialStore");
        expect(result.value.token).toBe("axm_ses_near_expiry");
      }
    }).pipe(Effect.provide(layer));
  });
});
