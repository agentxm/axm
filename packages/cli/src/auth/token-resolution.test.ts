/**
 * Unit tests for token resolution precedence chain.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import { beforeEach, describe, expect, it } from "vitest";

import { CliEnvConfig, type CliEnvConfigService } from "../config/index.js";
import { CredentialStoreTest } from "./credential-store.js";
import {
  resolveToken,
  resolveStoredToken,
  resolveAmbientToken,
  resetEnvVarMessageFlag,
} from "./token-resolution.js";

const REGISTRY_URL = "https://registry.agentxm.ai";

/**
 * Creates a CliEnvConfig test layer with overrides.
 */
const makeTestConfig = (overrides: Partial<CliEnvConfigService> = {}): Layer.Layer<CliEnvConfig> =>
  Layer.succeed(CliEnvConfig, {
    registryUrl: "https://registry.agentxm.ai",
    token: Option.none(),
    ci: "false",
    doNotTrack: Option.none(),
    telemetry: Option.none(),
    sshClient: Option.none(),
    sshTty: Option.none(),
    xdgConfigHome: Option.none(),
    claudeSkillsDir: Option.none(),
    geminiCliSkillsDir: Option.none(),
    installInternalSkills: Option.none(),
    vitest: "false",
    home: Option.none(),
    userProfile: Option.none(),
    homePath: Option.none(),
    verbose: Option.none(),
    debug: Option.none(),
    ...overrides,
  } satisfies CliEnvConfigService);

describe("resolveToken", () => {
  beforeEach(() => {
    resetEnvVarMessageFlag();
  });

  it("returns EnvVar token source when AXM_TOKEN is set", async () => {
    const configLayer = makeTestConfig({
      token: Option.some(Redacted.make("axm_ses_env_token")),
    });
    const layer = Layer.merge(CredentialStoreTest(), configLayer);
    const result = await Effect.runPromise(resolveToken(REGISTRY_URL).pipe(Effect.provide(layer)));

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("EnvVar");
      expect(result.value.token).toBe("axm_ses_env_token");
    }
  });

  it("returns Flag token source when --token flag is provided", async () => {
    const configLayer = makeTestConfig();
    const layer = Layer.merge(CredentialStoreTest(), configLayer);
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
    const configLayer = makeTestConfig();
    const layer = Layer.merge(
      CredentialStoreTest("encrypted-file", {
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
      }),
      configLayer,
    );

    const result = await Effect.runPromise(resolveToken(REGISTRY_URL).pipe(Effect.provide(layer)));

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("CredentialStore");
      expect(result.value.token).toBe("axm_ses_stored");
    }
  });

  it("returns none when no token source is available", async () => {
    const configLayer = makeTestConfig();
    const layer = Layer.merge(CredentialStoreTest(), configLayer);
    const result = await Effect.runPromise(resolveToken(REGISTRY_URL).pipe(Effect.provide(layer)));

    expect(Option.isNone(result)).toBe(true);
  });

  it("AXM_TOKEN takes priority over --token flag", async () => {
    const configLayer = makeTestConfig({
      token: Option.some(Redacted.make("axm_ses_env_priority")),
    });
    const layer = Layer.merge(CredentialStoreTest(), configLayer);
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
    const configLayer = makeTestConfig();
    const layer = Layer.merge(
      CredentialStoreTest("encrypted-file", {
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
      }),
      configLayer,
    );

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
    // An empty Redacted string is still Some — the length check handles it
    const configLayer = makeTestConfig({
      token: Option.some(Redacted.make("")),
    });
    const layer = Layer.merge(CredentialStoreTest(), configLayer);
    const result = await Effect.runPromise(
      resolveToken(REGISTRY_URL, "axm_ses_flag").pipe(Effect.provide(layer)),
    );

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("Flag");
    }
  });

  it("ignores empty --token flag", async () => {
    const configLayer = makeTestConfig();
    const layer = Layer.merge(CredentialStoreTest(), configLayer);
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
    const configLayer = makeTestConfig({
      token: Option.some(Redacted.make("axm_ses_env_should_be_ignored")),
    });
    const layer = Layer.merge(CredentialStoreTest(), configLayer);
    const result = await Effect.runPromise(
      resolveStoredToken(REGISTRY_URL).pipe(Effect.provide(layer)),
    );

    // Should return none — env var is not checked by resolveStoredToken
    expect(Option.isNone(result)).toBe(true);
  });
});

describe("resolveAmbientToken", () => {
  beforeEach(() => {
    resetEnvVarMessageFlag();
  });

  it("returns EnvVar token when AXM_TOKEN is set", async () => {
    const layer = makeTestConfig({
      token: Option.some(Redacted.make("axm_ses_env_ambient")),
    });
    const result = await Effect.runPromise(resolveAmbientToken().pipe(Effect.provide(layer)));

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("EnvVar");
      expect(result.value.token).toBe("axm_ses_env_ambient");
    }
  });

  it("returns Flag token when flagToken is provided", async () => {
    const layer = makeTestConfig();
    const result = await Effect.runPromise(
      resolveAmbientToken("axm_ses_flag_ambient").pipe(Effect.provide(layer)),
    );

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("Flag");
      expect(result.value.token).toBe("axm_ses_flag_ambient");
    }
  });

  it("returns none when neither is available", async () => {
    const layer = makeTestConfig();
    const result = await Effect.runPromise(resolveAmbientToken().pipe(Effect.provide(layer)));

    expect(Option.isNone(result)).toBe(true);
  });

  it("AXM_TOKEN takes priority over flag", async () => {
    const layer = makeTestConfig({
      token: Option.some(Redacted.make("axm_ses_env_priority")),
    });
    const result = await Effect.runPromise(
      resolveAmbientToken("axm_ses_flag_ignored").pipe(Effect.provide(layer)),
    );

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value._tag).toBe("EnvVar");
      expect(result.value.token).toBe("axm_ses_env_priority");
    }
  });

  it("does not access credential store (no CredentialStore layer needed)", async () => {
    // resolveAmbientToken requires CliEnvConfig but not CredentialStore
    const layer = makeTestConfig();
    const result = await Effect.runPromise(resolveAmbientToken().pipe(Effect.provide(layer)));

    expect(Option.isNone(result)).toBe(true);
  });
});
