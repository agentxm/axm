/**
 * Unit tests for CredentialStore service.
 */

import { describe, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { expect } from "vitest";
import { normalizeHandle } from "../extensions/handle.js";
import {
  CredentialStore,
  CredentialStoreTest,
  type EnvironmentInfo,
  canUsePersistedCredentials,
  selectTier,
} from "./credential-store.js";

describe("CredentialStore", () => {
  describe("CredentialStoreTest (in-memory)", () => {
    const registryUrl = "https://registry.agentxm.ai";
    const credentials = {
      access_token: "axm_ses_abc",
      refresh_token: "axm_ref_def",
      expires_at: DateTime.makeUnsafe("2026-03-12T10:30:00Z"),
    };

    it.effect("returns none when no credentials exist", () => {
      const layer = CredentialStoreTest();
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        const result = yield* store.load(registryUrl);
        expect(Option.isNone(result)).toBe(true);
      }).pipe(Effect.provide(layer));
    });

    it.effect("saves and loads credentials", () => {
      const layer = CredentialStoreTest();
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.save(registryUrl, normalizeHandle("@alice"), credentials);
        const result = yield* store.load(registryUrl);
        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) {
          expect(result.value.handle).toBe("@alice");
          expect(result.value.access_token).toBe("axm_ses_abc");
          expect(result.value.refresh_token).toBe("axm_ref_def");
          expect(DateTime.formatIso(result.value.expires_at)).toBe("2026-03-12T10:30:00.000Z");
        }
      }).pipe(Effect.provide(layer));
    });

    it.effect("clears credentials for a registry", () => {
      const layer = CredentialStoreTest();
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.save(registryUrl, normalizeHandle("@alice"), credentials);
        yield* store.clear(registryUrl);
        const result = yield* store.load(registryUrl);
        expect(Option.isNone(result)).toBe(true);
      }).pipe(Effect.provide(layer));
    });

    it.effect("deactivates previous accounts on save", () => {
      const layer = CredentialStoreTest();
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.save(registryUrl, normalizeHandle("@alice"), credentials);
        yield* store.save(registryUrl, normalizeHandle("@bob"), {
          ...credentials,
          access_token: "axm_ses_bob",
        });
        const result = yield* store.load(registryUrl);
        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) {
          expect(result.value.handle).toBe("@bob");
          expect(result.value.access_token).toBe("axm_ses_bob");
        }
      }).pipe(Effect.provide(layer));
    });

    it.effect("keeps separate registries independent", () => {
      const layer = CredentialStoreTest();
      const otherUrl = "https://registry.corp.com";
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.save(registryUrl, normalizeHandle("@alice"), credentials);
        yield* store.save(otherUrl, normalizeHandle("@bob"), {
          ...credentials,
          access_token: "axm_ses_bob",
        });
        const result1 = yield* store.load(registryUrl);
        const result2 = yield* store.load(otherUrl);
        expect(Option.isSome(result1)).toBe(true);
        expect(Option.isSome(result2)).toBe(true);
        if (Option.isSome(result1) && Option.isSome(result2)) {
          expect(result1.value.handle).toBe("@alice");
          expect(result2.value.handle).toBe("@bob");
        }
      }).pipe(Effect.provide(layer));
    });

    it.effect("reports the configured tier", () => {
      const layer = CredentialStoreTest("plaintext-file");
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        expect(store.tier).toBe("plaintext-file");
      }).pipe(Effect.provide(layer));
    });

    it.effect("fails save when persisted credentials are disabled", () => {
      const layer = CredentialStoreTest("restricted-file", undefined, false);
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        const result = yield* store
          .save(registryUrl, normalizeHandle("@alice"), credentials)
          .pipe(Effect.catchTag("AppError", (error) => Effect.succeed(error.code)));
        expect(result).toBe("auth");
      }).pipe(Effect.provide(layer));
    });

    it.effect("clear is a no-op when no credentials exist", () => {
      const layer = CredentialStoreTest();
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.clear(registryUrl);
        const result = yield* store.load(registryUrl);
        expect(Option.isNone(result)).toBe(true);
      }).pipe(Effect.provide(layer));
    });
  });

  describe("selectTier", () => {
    const baseEnv: EnvironmentInfo = {
      isSSH: false,
      isContainer: false,
      isWSL: false,
      isCI: false,
      isRoot: false,
    };

    it("selects keychain for default environment", () => {
      expect(selectTier(baseEnv)).toBe("keychain");
    });

    it("selects restricted-file for container environment", () => {
      expect(selectTier({ ...baseEnv, isContainer: true })).toBe("restricted-file");
    });

    it("selects restricted-file for CI environment", () => {
      expect(selectTier({ ...baseEnv, isCI: true })).toBe("restricted-file");
    });

    it("selects restricted-file for SSH environment", () => {
      expect(selectTier({ ...baseEnv, isSSH: true })).toBe("restricted-file");
    });

    it("selects keychain for WSL desktop environments", () => {
      expect(selectTier({ ...baseEnv, isWSL: true })).toBe("keychain");
    });

    it("container takes precedence over SSH", () => {
      expect(selectTier({ ...baseEnv, isContainer: true, isSSH: true })).toBe("restricted-file");
    });

    it("container takes precedence over CI", () => {
      expect(selectTier({ ...baseEnv, isContainer: true, isCI: true })).toBe("restricted-file");
    });
  });

  describe("canUsePersistedCredentials", () => {
    const baseEnv: EnvironmentInfo = {
      isSSH: false,
      isContainer: false,
      isWSL: false,
      isCI: false,
      isRoot: false,
    };

    it("allows persisted credentials in normal local environments", () => {
      expect(canUsePersistedCredentials(baseEnv)).toBe(true);
    });

    it("disables persisted credentials in CI", () => {
      expect(canUsePersistedCredentials({ ...baseEnv, isCI: true })).toBe(false);
    });

    it("disables persisted credentials in containers", () => {
      expect(canUsePersistedCredentials({ ...baseEnv, isContainer: true })).toBe(false);
    });
  });
});
