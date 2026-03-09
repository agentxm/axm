/**
 * Unit tests for CredentialStore service.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import {
  CredentialStore,
  CredentialStoreTest,
  type EnvironmentInfo,
  selectTier,
} from "./credential-store.js";

describe("CredentialStore", () => {
  describe("CredentialStoreTest (in-memory)", () => {
    const registryUrl = "https://registry.agentxm.ai";
    const credentials = {
      access_token: "axm_ses_abc",
      refresh_token: "axm_ref_def",
      expires_at: "2026-03-12T10:30:00Z",
    };

    it("returns none when no credentials exist", async () => {
      const layer = CredentialStoreTest();
      const program = Effect.gen(function* () {
        const store = yield* CredentialStore;
        return yield* store.load(registryUrl);
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
      expect(Option.isNone(result)).toBe(true);
    });

    it("saves and loads credentials", async () => {
      const layer = CredentialStoreTest();
      const program = Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.save(registryUrl, "alice", credentials);
        return yield* store.load(registryUrl);
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value.handle).toBe("alice");
        expect(result.value.access_token).toBe("axm_ses_abc");
        expect(result.value.refresh_token).toBe("axm_ref_def");
        expect(result.value.expires_at).toBe("2026-03-12T10:30:00Z");
      }
    });

    it("clears credentials for a registry", async () => {
      const layer = CredentialStoreTest();
      const program = Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.save(registryUrl, "alice", credentials);
        yield* store.clear(registryUrl);
        return yield* store.load(registryUrl);
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
      expect(Option.isNone(result)).toBe(true);
    });

    it("deactivates previous accounts on save", async () => {
      const layer = CredentialStoreTest();
      const program = Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.save(registryUrl, "alice", credentials);
        yield* store.save(registryUrl, "bob", {
          ...credentials,
          access_token: "axm_ses_bob",
        });
        return yield* store.load(registryUrl);
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value.handle).toBe("bob");
        expect(result.value.access_token).toBe("axm_ses_bob");
      }
    });

    it("keeps separate registries independent", async () => {
      const layer = CredentialStoreTest();
      const otherUrl = "https://registry.corp.com";
      const program = Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.save(registryUrl, "alice", credentials);
        yield* store.save(otherUrl, "bob", {
          ...credentials,
          access_token: "axm_ses_bob",
        });
        const result1 = yield* store.load(registryUrl);
        const result2 = yield* store.load(otherUrl);
        return [result1, result2] as const;
      });

      const [result1, result2] = await Effect.runPromise(program.pipe(Effect.provide(layer)));
      expect(Option.isSome(result1)).toBe(true);
      expect(Option.isSome(result2)).toBe(true);
      if (Option.isSome(result1) && Option.isSome(result2)) {
        expect(result1.value.handle).toBe("alice");
        expect(result2.value.handle).toBe("bob");
      }
    });

    it("reports the configured tier", async () => {
      const layer = CredentialStoreTest("plaintext-file");
      const program = Effect.gen(function* () {
        const store = yield* CredentialStore;
        return store.tier;
      });

      const tier = await Effect.runPromise(program.pipe(Effect.provide(layer)));
      expect(tier).toBe("plaintext-file");
    });

    it("clear is a no-op when no credentials exist", async () => {
      const layer = CredentialStoreTest();
      const program = Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.clear(registryUrl);
        return yield* store.load(registryUrl);
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
      expect(Option.isNone(result)).toBe(true);
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

    it("selects encrypted-file for default environment", () => {
      expect(selectTier(baseEnv)).toBe("encrypted-file");
    });

    it("selects plaintext-file for container environment", () => {
      expect(selectTier({ ...baseEnv, isContainer: true })).toBe("plaintext-file");
    });

    it("selects plaintext-file for CI environment", () => {
      expect(selectTier({ ...baseEnv, isCI: true })).toBe("plaintext-file");
    });

    it("selects encrypted-file for SSH environment", () => {
      expect(selectTier({ ...baseEnv, isSSH: true })).toBe("encrypted-file");
    });

    it("selects encrypted-file for WSL environment (keychain not implemented)", () => {
      expect(selectTier({ ...baseEnv, isWSL: true })).toBe("encrypted-file");
    });

    it("container takes precedence over SSH", () => {
      expect(selectTier({ ...baseEnv, isContainer: true, isSSH: true })).toBe("plaintext-file");
    });

    it("container takes precedence over CI", () => {
      expect(selectTier({ ...baseEnv, isContainer: true, isCI: true })).toBe("plaintext-file");
    });
  });
});
