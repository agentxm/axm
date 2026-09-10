/**
 * Unit tests for the auth guard combinator.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { RegistryUrl } from "@agentxm/registry-client";
import { CredentialStoreTest } from "./credential-store.js";
import { withAuthGuard } from "./guard.js";
import { RegistryAuthFailed } from "./errors.js";
import { CredentialFileSchema } from "./schema.js";

const REGISTRY_URL = "https://registry.agentxm.ai";

const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);

const makeInnerEffect = () => Effect.succeed("publish-result" as const);

const makeCredentialFile = (registries: Record<string, unknown>) =>
  Schema.decodeUnknownSync(CredentialFileSchema)({
    version: 1 as const,
    registries,
  });

const makeLayers = (opts?: {
  hasToken?: boolean;
  storedRegistryUrl?: string;
  allowsPersistedCredentials?: boolean;
}) => {
  const credStoreLayer = opts?.hasToken
    ? CredentialStoreTest(
        "restricted-file",
        makeCredentialFile({
          [opts?.storedRegistryUrl ?? REGISTRY_URL]: {
            accounts: {
              "@alice": {
                access_token: "axm_ses_existing",
                refresh_token: "axm_ref_existing",
                expires_at: "2099-01-01T00:00:00Z",
                active: true,
              },
            },
          },
        }),
        opts?.allowsPersistedCredentials,
      )
    : CredentialStoreTest("restricted-file", undefined, opts?.allowsPersistedCredentials);

  return Layer.mergeAll(credStoreLayer, registryUrlLayer);
};

describe("withAuthGuard", () => {
  it.effect("passes through when token is resolvable", () => {
    const layer = makeLayers({ hasToken: true });
    return withAuthGuard(makeInnerEffect(), { registryUrl: REGISTRY_URL }).pipe(
      Effect.provide(layer),
      Effect.map((result) => {
        expect(result).toBe("publish-result");
      }),
    );
  });

  it.effect("uses the explicit registry URL for token resolution", () => {
    const customRegistryUrl = "https://custom.registry.example.com";
    const layer = makeLayers({ hasToken: true, storedRegistryUrl: customRegistryUrl });
    return withAuthGuard(makeInnerEffect(), {
      registryUrl: customRegistryUrl,
    }).pipe(
      Effect.provide(layer),
      Effect.map((result) => {
        expect(result).toBe("publish-result");
      }),
    );
  });

  it.effect("skips auth for local registry URLs", () => {
    const layer = makeLayers();
    return withAuthGuard(makeInnerEffect(), {
      registryUrl: "file:///tmp/registry",
    }).pipe(
      Effect.provide(layer),
      Effect.map((result) => {
        expect(result).toBe("publish-result");
      }),
    );
  });

  it.effect("fails with auth_required when no token", () => {
    const layer = makeLayers();
    return withAuthGuard(makeInnerEffect()).pipe(
      Effect.provide(layer),
      Effect.catchTag("AuthLoginRequired", (e) => Effect.succeed({ error: true, tag: e._tag })),
      Effect.map((result) => {
        expect(result).toMatchObject({ error: true, tag: "AuthLoginRequired" });
      }),
    );
  });

  it.effect("fails with auth_required when persisted credentials are disabled", () => {
    const layer = makeLayers({ allowsPersistedCredentials: false });
    return withAuthGuard(makeInnerEffect()).pipe(
      Effect.provide(layer),
      Effect.catchTag("AuthTokenPolicyRequired", (e) =>
        Effect.succeed({ error: true, tag: e._tag }),
      ),
      Effect.map((result) => {
        expect(result).toMatchObject({ error: true, tag: "AuthTokenPolicyRequired" });
      }),
    );
  });

  it.effect("propagates inner effect errors", () => {
    const layer = makeLayers({ hasToken: true });
    const failingEffect = Effect.fail(
      new RegistryAuthFailed({
        category: "internal",
        detail: "Publish failed",
      }),
    );
    return withAuthGuard(failingEffect).pipe(
      Effect.provide(layer),
      Effect.catchTag("RegistryAuthFailed", (e) =>
        Effect.succeed({ error: true, code: e.category }),
      ),
      Effect.map((result) => {
        expect(result).toMatchObject({ error: true, code: "internal" });
      }),
    );
  });
});
