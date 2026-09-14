import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import {
  loadNpmPublicationAuth,
  npmPublicationEnvironment,
  requireNpmPackageInitialization,
} from "./release-npm-auth.js";

const configuredEnvironment = {
  NPM_INITIAL_PUBLISH_TOKEN: "initial-publish-fixture",
  NPM_CONFIG_USERCONFIG: "/runner/temp/npmrc-fixture",
  NODE_AUTH_TOKEN: "unrelated-fixture",
  PATH: "/runner/bin",
};

describe("npm initial package authentication", () => {
  it.effect("uses trusted publishing when no initial credential is supplied", () =>
    Effect.gen(function* () {
      const authentication = yield* loadNpmPublicationAuth(ConfigProvider.fromEnvRecord({}));
      expect(authentication).toEqual({ kind: "oidc" });
      const failure = yield* Effect.flip(
        requireNpmPackageInitialization("@agentxm/new", false, authentication),
      );
      expect(failure).toMatchObject({
        _tag: "NpmPackagesUninitialized",
        packages: ["@agentxm/new"],
      });
    }),
  );

  it.effect("treats an empty Actions secret as absent", () =>
    Effect.gen(function* () {
      const authentication = yield* loadNpmPublicationAuth(
        ConfigProvider.fromEnvRecord({ NPM_INITIAL_PUBLISH_TOKEN: "" }),
      );
      expect(authentication).toEqual({ kind: "oidc" });
    }),
  );

  it.effect("keeps missing setup-node configuration distinct from npm publication failures", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        loadNpmPublicationAuth(
          ConfigProvider.fromEnvRecord({
            NPM_INITIAL_PUBLISH_TOKEN: configuredEnvironment.NPM_INITIAL_PUBLISH_TOKEN,
          }),
        ),
      );
      expect(failure._tag).toBe("ConfigError");
      expect(String(failure)).toContain("NPM_CONFIG_USERCONFIG");
      expect(String(failure)).not.toContain(configuredEnvironment.NPM_INITIAL_PUBLISH_TOKEN);
    }),
  );

  it.effect("keeps credentials redacted until creating a missing package", () =>
    Effect.gen(function* () {
      const authentication = yield* loadNpmPublicationAuth(
        ConfigProvider.fromEnvRecord(configuredEnvironment),
      );
      expect(JSON.stringify(authentication)).not.toContain(
        configuredEnvironment.NPM_INITIAL_PUBLISH_TOKEN,
      );
      const environment = yield* npmPublicationEnvironment(
        "@agentxm/new",
        false,
        authentication,
        configuredEnvironment,
      );
      expect(environment["NODE_AUTH_TOKEN"]).toBe(configuredEnvironment.NPM_INITIAL_PUBLISH_TOKEN);
      expect(environment["NPM_CONFIG_USERCONFIG"]).toBe(
        configuredEnvironment.NPM_CONFIG_USERCONFIG,
      );
      expect(environment["NPM_INITIAL_PUBLISH_TOKEN"]).toBeUndefined();
      expect(environment["PATH"]).toBe(configuredEnvironment.PATH);
      expect(configuredEnvironment.NODE_AUTH_TOKEN).toBe("unrelated-fixture");
    }),
  );

  it.effect(
    "withholds the initial credential from existing-package publication and tag repair",
    () =>
      Effect.gen(function* () {
        const authentication = yield* loadNpmPublicationAuth(
          ConfigProvider.fromEnvRecord(configuredEnvironment),
        );
        const environment = yield* npmPublicationEnvironment(
          "@agentxm/existing",
          true,
          authentication,
          configuredEnvironment,
        );
        expect(environment["NODE_AUTH_TOKEN"]).toBeUndefined();
        expect(environment["NPM_CONFIG_USERCONFIG"]).toBeUndefined();
        expect(environment["NPM_INITIAL_PUBLISH_TOKEN"]).toBeUndefined();
        expect(environment["PATH"]).toBe(configuredEnvironment.PATH);
      }),
  );
});
