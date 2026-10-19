/**
 * Unit tests for token resolution precedence chain.
 */

import { decodeHttpRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { describe, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { expect } from "vitest";

import { AuthClientTest } from "../authentication/auth-client.js";
import { CredentialStoreTest } from "./credential-store.js";
import { CredentialFileSchema } from "./schema.js";
import { WorkloadCredentialsTest } from "./workload-credentials.js";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import { WorkloadTokenSource } from "./schema.js";
import {
  resolveRequiredToken,
  resolveStoredToken,
  resolvePresentedToken,
  resolveRequestToken,
} from "./token-resolution.js";

const REGISTRY_URL = "https://registry.agentxm.ai";
const ENDPOINT = decodeHttpRegistryEndpointSync(REGISTRY_URL);
const futureExpiry = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const nearExpiry = () => new Date(Date.now() + 60 * 1000).toISOString();

const makeCredentialFile = (registries: Record<string, unknown>) =>
  Schema.decodeUnknownSync(CredentialFileSchema)({
    version: 1 as const,
    registries,
  });

/** The environment an invocation reads, with empty values preserved as the CLI does. */
const environmentLayer = (environment: Record<string, string> = {}) =>
  ConfigProvider.layer(ConfigProvider.fromEnv({ env: environment, preserveEmptyStrings: true }));

const makeRuntimeLayer = (
  credentialData?: Parameters<typeof CredentialStoreTest>[1],
  authClientLayer = AuthClientTest(),
  allowsPersistedCredentials?: boolean,
  environment: Record<string, string> = {},
) =>
  Layer.mergeAll(
    CredentialStoreTest("restricted-file", credentialData, allowsPersistedCredentials),
    authClientLayer,
    WorkloadCredentialsTest(),
    NodeServices.layer,
    environmentLayer(environment),
  );

describe("resolveRequestToken for the default Registry", () => {
  it.effect("returns EnvVar token source when AXM_TOKEN is set", () => {
    const layer = makeRuntimeLayer(undefined, undefined, undefined, {
      AXM_TOKEN: "axm_ses_env_token",
    });
    return Effect.gen(function* () {
      const result = yield* resolveRequestToken(ENDPOINT, ENDPOINT);
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("EnvVar");
        expect(result.value.token).toBe("axm_ses_env_token");
      }
    }).pipe(Effect.provide(layer));
  });

  it.effect("reads and trims AXM_TOKEN_FILE without exposing it as an env token", () => {
    const directory = mkdtempSync(join(tmpdir(), "axm-token-file-"));
    const tokenPath = join(directory, "token");
    writeFileSync(tokenPath, "axm_pat_file_token\n", { mode: 0o600 });
    const layer = makeRuntimeLayer(undefined, undefined, undefined, { AXM_TOKEN_FILE: tokenPath });
    return Effect.gen(function* () {
      const result = yield* resolveRequestToken(ENDPOINT, ENDPOINT);
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
    const layer = makeRuntimeLayer(undefined, undefined, undefined, {
      AXM_TOKEN: "axm_pat_env_token",
      AXM_TOKEN_FILE: tokenPath,
    });
    return Effect.gen(function* () {
      const result = yield* resolveRequestToken(ENDPOINT, ENDPOINT);
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
      const result = yield* resolveRequestToken(ENDPOINT, ENDPOINT);
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
      const result = yield* resolveRequestToken(ENDPOINT, ENDPOINT);
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect("ignores empty AXM_TOKEN", () => {
    const layer = makeRuntimeLayer(undefined, undefined, undefined, { AXM_TOKEN: "" });
    return Effect.gen(function* () {
      const result = yield* resolveRequestToken(ENDPOINT, ENDPOINT);
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
      const result = yield* resolveRequestToken(ENDPOINT, ENDPOINT);
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
      const result = yield* resolveRequiredToken(ENDPOINT, ENDPOINT);
      expect(result._tag).toBe("CredentialStore");
      expect(result.token).toBe("axm_ses_stored");
    }).pipe(Effect.provide(layer));
  });

  it.effect("returns a non-circular human handoff when no token is available", () => {
    const layer = makeRuntimeLayer();
    return Effect.gen(function* () {
      const error = yield* Effect.flip(resolveRequiredToken(ENDPOINT, ENDPOINT));
      expect(error._tag).toBe("SignedOut");
      if (error._tag !== "SignedOut") throw new Error("Expected SignedOut");
      expect(error.message).toBe("You are not signed in.");
    }).pipe(Effect.provide(layer));
  });

  it.effect("offers token-file recovery when persisted credentials are disabled", () => {
    const layer = makeRuntimeLayer(undefined, AuthClientTest(), false);
    return Effect.gen(function* () {
      const error = yield* Effect.flip(resolveRequiredToken(ENDPOINT, ENDPOINT));
      expect(error._tag).toBe("AuthTokenPolicyRequired");
    }).pipe(Effect.provide(layer));
  });
});

describe("resolveStoredToken", () => {
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
      const result = yield* resolveStoredToken(ENDPOINT);
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
      const result = yield* resolveStoredToken(ENDPOINT);
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect("does not check AXM_TOKEN env var", () => {
    const layer = Layer.merge(
      CredentialStoreTest(),
      environmentLayer({ AXM_TOKEN: "axm_ses_env_should_be_ignored" }),
    );
    return Effect.gen(function* () {
      const result = yield* resolveStoredToken(ENDPOINT);
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
      const result = yield* resolveStoredToken(ENDPOINT);
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(layer));
  });
});

describe("resolveRequestToken", () => {
  it.effect("prefers AXM_TOKEN for requests to the default registry", () => {
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
      undefined,
      undefined,
      { AXM_TOKEN: "axm_ses_env" },
    );

    return Effect.gen(function* () {
      const result = yield* resolveRequestToken(ENDPOINT, ENDPOINT);
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("EnvVar");
        expect(result.value.token).toBe("axm_ses_env");
      }
    }).pipe(Effect.provide(layer));
  });

  it.effect("does not apply AXM_TOKEN to non-default registry requests", () => {
    return Effect.gen(function* () {
      const result = yield* resolveRequestToken(
        decodeHttpRegistryEndpointSync("https://other-registry.example.com"),
        ENDPOINT,
      );
      expect(Option.isNone(result)).toBe(true);
    }).pipe(
      Effect.provide(
        makeRuntimeLayer(undefined, undefined, undefined, { AXM_TOKEN: "axm_ses_env" }),
      ),
    );
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
      const result = yield* resolveRequestToken(
        decodeHttpRegistryEndpointSync(otherRegistryUrl),
        ENDPOINT,
      );
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
      const result = yield* resolveRequestToken(
        decodeHttpRegistryEndpointSync(otherRegistryUrl),
        ENDPOINT,
      );
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
      const result = yield* resolveRequestToken(
        decodeHttpRegistryEndpointSync(otherRegistryUrl),
        ENDPOINT,
      );
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value._tag).toBe("CredentialStore");
        expect(result.value.token).toBe("axm_ses_near_expiry");
      }
    }).pipe(Effect.provide(layer));
  });
});

describe("resolvePresentedToken", () => {
  const githubActions = {
    ACTIONS_ID_TOKEN_REQUEST_URL: "https://actions.example.test/token?api-version=2.0",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fixture-request-token",
  };
  const stored = makeCredentialFile({
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
  });
  const heldToken = new WorkloadTokenSource({
    token: "fixture-held-workload",
    expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00.000Z"),
    endpoint: ENDPOINT,
  });
  const presented = (
    environment: Record<string, string>,
    held: Option.Option<WorkloadTokenSource>,
  ) =>
    resolvePresentedToken(ENDPOINT, ENDPOINT).pipe(
      Effect.map(Option.map((source) => source.token)),
      Effect.provide(
        Layer.mergeAll(
          CredentialStoreTest("restricted-file", stored),
          WorkloadCredentialsTest({
            held: () => Effect.succeed(held),
            tokenFor: () => Effect.die(new Error("The transport never exchanges an identity")),
          }),
          NodeServices.layer,
          environmentLayer(environment),
        ),
      ),
    );

  it.effect("presents nothing for an identity no command has exchanged yet", () =>
    Effect.gen(function* () {
      expect(yield* presented(githubActions, Option.none())).toEqual(Option.none());
    }),
  );

  it.effect("presents the workload token a command already obtained", () =>
    Effect.gen(function* () {
      expect(yield* presented(githubActions, Option.some(heldToken))).toEqual(
        Option.some("fixture-held-workload"),
      );
    }),
  );

  it.effect("presents an explicit token before a held workload token", () =>
    Effect.gen(function* () {
      expect(
        yield* presented({ ...githubActions, AXM_TOKEN: "axm_ses_env" }, Option.some(heldToken)),
      ).toEqual(Option.some("axm_ses_env"));
    }),
  );

  it.effect("presents the stored session when no identity is offered", () =>
    Effect.gen(function* () {
      expect(yield* presented({}, Option.none())).toEqual(Option.some("axm_ses_stored"));
    }),
  );
});
