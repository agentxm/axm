import { describe, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { expect } from "vitest";

import { RegistryAccessFailed } from "@agentxm/registry-access/authentication";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { CredentialStore, type CredentialStoreService } from "@agentxm/registry-access/credentials";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { RegistryContextTest } from "@agentxm/registry-client/testing";

import { registryLoginSuggestions } from "./registry-login-suggestion.js";

const DEFAULT_REGISTRY = "https://registry.example.test";
const SECOND_REGISTRY = "https://registry.other.test";
const defaultEndpoint = decodeRegistryEndpointSync(DEFAULT_REGISTRY);
const secondEndpoint = decodeRegistryEndpointSync(SECOND_REGISTRY);

const storedCredentials = {
  handle: normalizeHandle("@test"),
  access_token: "axm_ses_test",
  refresh_token: "axm_refresh_test",
  expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
};

const credentialStore = (load: CredentialStoreService["load"]) =>
  Layer.succeed(CredentialStore, {
    tier: "restricted-file",
    allowsPersistedCredentials: true,
    withRefreshLock: (effect) => effect,
    load,
    reload: load,
    save: () => Effect.void,
    clear: () => Effect.void,
  });

/** No ambient token is presented, so only stored credentials decide. */
const makeLayer = (load: CredentialStoreService["load"]) =>
  Layer.mergeAll(
    credentialStore(load),
    RegistryContextTest(DEFAULT_REGISTRY),
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} })),
  );

describe("registryLoginSuggestions", () => {
  it.effect("suggests login when any consulted registry origin lacks credentials", () =>
    Effect.gen(function* () {
      const suggestions = yield* registryLoginSuggestions([
        defaultEndpoint,
        secondEndpoint,
        decodeRegistryEndpointSync("file:///tmp/local-registry"),
      ]);

      expect(suggestions).toEqual([
        {
          description: "Sign in to check whether the extension is private.",
          cmd: "axm login",
        },
      ]);
    }).pipe(
      Effect.provide(
        makeLayer((origin) =>
          Effect.succeed(
            origin === DEFAULT_REGISTRY ? Option.some(storedCredentials) : Option.none(),
          ),
        ),
      ),
    ),
  );

  it.effect("suppresses login when every consulted registry origin has credentials", () =>
    Effect.gen(function* () {
      const suggestions = yield* registryLoginSuggestions([defaultEndpoint, secondEndpoint]);

      expect(suggestions).toEqual([]);
    }).pipe(Effect.provide(makeLayer(() => Effect.succeed(Option.some(storedCredentials))))),
  );

  it.effect("treats an unreadable credential store as unauthenticated", () =>
    Effect.gen(function* () {
      const suggestions = yield* registryLoginSuggestions([defaultEndpoint]);

      expect(suggestions).toHaveLength(1);
    }).pipe(
      Effect.provide(
        makeLayer(() =>
          Effect.fail(
            new RegistryAccessFailed({ category: "auth", detail: "Credential store unavailable" }),
          ),
        ),
      ),
    ),
  );

  it.effect("offers no suggestion when no Registry selection is composed", () =>
    Effect.gen(function* () {
      const suggestions = yield* registryLoginSuggestions([defaultEndpoint]);

      expect(suggestions).toEqual([]);
    }).pipe(Effect.provide(credentialStore(() => Effect.succeed(Option.none())))),
  );
});
