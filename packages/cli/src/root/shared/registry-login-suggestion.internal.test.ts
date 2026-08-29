import { describe, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, expect } from "vitest";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { normalizeHandle } from "@agentxm/client-core/unstable/extensions";
import {
  CredentialStore,
  type CredentialStoreService,
  RegistryUrl,
} from "@agentxm/client-core/unstable/auth";

import { makeRegistryLoginSuggestionResolver } from "./registry-login-suggestion.js";

const DEFAULT_REGISTRY = "https://registry.example.test";
const SECOND_REGISTRY = "https://registry.other.test";

const storedCredentials = {
  handle: normalizeHandle("@test"),
  access_token: "axm_ses_test",
  refresh_token: "axm_refresh_test",
  expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
};

const makeLayer = (load: CredentialStoreService["load"]) =>
  Layer.mergeAll(
    Layer.succeed(CredentialStore, {
      tier: "restricted-file",
      allowsPersistedCredentials: true,
      load,
      save: () => Effect.void,
      clear: () => Effect.void,
    }),
    Layer.succeed(RegistryUrl, DEFAULT_REGISTRY),
  );

describe("makeRegistryLoginSuggestionResolver", () => {
  let originalToken: string | undefined;
  let originalTokenFile: string | undefined;

  beforeEach(() => {
    originalToken = process.env["AXM_TOKEN"];
    originalTokenFile = process.env["AXM_TOKEN_FILE"];
    delete process.env["AXM_TOKEN"];
    delete process.env["AXM_TOKEN_FILE"];
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env["AXM_TOKEN"];
    else process.env["AXM_TOKEN"] = originalToken;
    if (originalTokenFile === undefined) delete process.env["AXM_TOKEN_FILE"];
    else process.env["AXM_TOKEN_FILE"] = originalTokenFile;
  });

  it.effect("suggests login when any consulted registry origin lacks credentials", () =>
    Effect.gen(function* () {
      const resolveSuggestions = yield* makeRegistryLoginSuggestionResolver;
      const suggestions = yield* resolveSuggestions([
        `${DEFAULT_REGISTRY}/v1/extensions/@test/skills/one`,
        `${SECOND_REGISTRY}/v1/extensions/@test/skills/two`,
        "file:///tmp/local-registry",
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
      const resolveSuggestions = yield* makeRegistryLoginSuggestionResolver;
      const suggestions = yield* resolveSuggestions([DEFAULT_REGISTRY, SECOND_REGISTRY]);

      expect(suggestions).toEqual([]);
    }).pipe(Effect.provide(makeLayer(() => Effect.succeed(Option.some(storedCredentials))))),
  );

  it.effect("treats an unreadable credential store as unauthenticated", () =>
    Effect.gen(function* () {
      const resolveSuggestions = yield* makeRegistryLoginSuggestionResolver;
      const suggestions = yield* resolveSuggestions([DEFAULT_REGISTRY]);

      expect(suggestions).toHaveLength(1);
    }).pipe(
      Effect.provide(
        makeLayer(() =>
          Effect.fail(makeAppError({ code: "auth", detail: "Credential store unavailable" })),
        ),
      ),
    ),
  );
});
