/**
 * Unit tests for token resolution precedence chain.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CredentialStoreTest } from "./credential-store.js";
import {
  resolveToken,
  resolveStoredToken,
  resolveAmbientToken,
  resetEnvVarMessageFlag,
} from "./token-resolution.js";

const REGISTRY_URL = "https://registry.agentxm.ai";

describe("resolveToken", () => {
  const originalEnv = process.env["AXM_TOKEN"];

  beforeEach(() => {
    delete process.env["AXM_TOKEN"];
    resetEnvVarMessageFlag();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["AXM_TOKEN"] = originalEnv;
    } else {
      delete process.env["AXM_TOKEN"];
    }
    resetEnvVarMessageFlag();
  });

  it("returns EnvVar token source when AXM_TOKEN is set", async () => {
    process.env["AXM_TOKEN"] = "axm_ses_env_token";
    const layer = CredentialStoreTest();
    const result = await Effect.runPromise(resolveToken(REGISTRY_URL).pipe(Effect.provide(layer)));

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("EnvVar");
      expect(result.value.token).toBe("axm_ses_env_token");
    }
  });

  it("returns Flag token source when --token flag is provided", async () => {
    const layer = CredentialStoreTest();
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
    const layer = CredentialStoreTest("encrypted-file", {
      version: 1,
      registries: {
        [REGISTRY_URL]: {
          accounts: {
            alice: {
              access_token: "axm_ses_stored",
              refresh_token: "axm_ref_stored",
              expires_at: "2026-03-12T10:30:00Z",
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
    const layer = CredentialStoreTest();
    const result = await Effect.runPromise(resolveToken(REGISTRY_URL).pipe(Effect.provide(layer)));

    expect(Option.isNone(result)).toBe(true);
  });

  it("AXM_TOKEN takes priority over --token flag", async () => {
    process.env["AXM_TOKEN"] = "axm_ses_env_priority";
    const layer = CredentialStoreTest();
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
    const layer = CredentialStoreTest("encrypted-file", {
      version: 1,
      registries: {
        [REGISTRY_URL]: {
          accounts: {
            alice: {
              access_token: "axm_ses_stored_ignored",
              refresh_token: "axm_ref_stored",
              expires_at: "2026-03-12T10:30:00Z",
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
    const layer = CredentialStoreTest();
    const result = await Effect.runPromise(
      resolveToken(REGISTRY_URL, "axm_ses_flag").pipe(Effect.provide(layer)),
    );

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("Flag");
    }
  });

  it("ignores empty --token flag", async () => {
    const layer = CredentialStoreTest();
    const result = await Effect.runPromise(
      resolveToken(REGISTRY_URL, "").pipe(Effect.provide(layer)),
    );

    expect(Option.isNone(result)).toBe(true);
  });
});

describe("resolveStoredToken", () => {
  it("returns stored credentials when they exist", async () => {
    const layer = CredentialStoreTest("encrypted-file", {
      version: 1,
      registries: {
        [REGISTRY_URL]: {
          accounts: {
            alice: {
              access_token: "axm_ses_stored",
              refresh_token: "axm_ref_stored",
              expires_at: "2026-03-12T10:30:00Z",
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

describe("resolveAmbientToken", () => {
  const originalEnv = process.env["AXM_TOKEN"];

  beforeEach(() => {
    delete process.env["AXM_TOKEN"];
    resetEnvVarMessageFlag();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["AXM_TOKEN"] = originalEnv;
    } else {
      delete process.env["AXM_TOKEN"];
    }
    resetEnvVarMessageFlag();
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

  it("does not access credential store (no layer needed)", async () => {
    // resolveAmbientToken has no CredentialStore requirement — runs without a layer
    const result = await Effect.runPromise(resolveAmbientToken());

    expect(Option.isNone(result)).toBe(true);
  });
});
