/**
 * Unit tests for token resolution precedence chain.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CredentialStoreTest } from "./credential-store.js";
import { resolveToken, resetEnvVarMessageFlag } from "./token-resolution.js";

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
