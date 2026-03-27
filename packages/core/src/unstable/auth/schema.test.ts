/**
 * Unit tests for auth schema validation.
 */

import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import {
  CredentialEntrySchema,
  CredentialFileSchema,
  CredentialStoreTokenSource,
  EnvVarTokenSource,
  FlagTokenSource,
  RegistryAccountsSchema,
} from "./schema.js";

describe("Auth schema", () => {
  describe("CredentialEntrySchema", () => {
    const validEntry = {
      access_token: "axm_ses_abc123",
      refresh_token: "axm_ref_def456",
      expires_at: "2026-03-12T10:30:00Z",
      active: true,
    };

    it("decodes a valid credential entry", () => {
      const result = Schema.decodeUnknownSync(CredentialEntrySchema)(validEntry);

      expect(result).toEqual(validEntry);
    });

    it("encodes back to the same shape", () => {
      const decoded = Schema.decodeUnknownSync(CredentialEntrySchema)(validEntry);
      const encoded = Schema.encodeSync(CredentialEntrySchema)(decoded);

      expect(encoded).toEqual(validEntry);
    });

    it("rejects missing access_token", () => {
      const { access_token: _, ...incomplete } = validEntry;

      expect(() => Schema.decodeUnknownSync(CredentialEntrySchema)(incomplete)).toThrow();
    });

    it("rejects missing refresh_token", () => {
      const { refresh_token: _, ...incomplete } = validEntry;

      expect(() => Schema.decodeUnknownSync(CredentialEntrySchema)(incomplete)).toThrow();
    });

    it("rejects missing expires_at", () => {
      const { expires_at: _, ...incomplete } = validEntry;

      expect(() => Schema.decodeUnknownSync(CredentialEntrySchema)(incomplete)).toThrow();
    });

    it("rejects missing active", () => {
      const { active: _, ...incomplete } = validEntry;

      expect(() => Schema.decodeUnknownSync(CredentialEntrySchema)(incomplete)).toThrow();
    });

    it("rejects non-boolean active", () => {
      expect(() =>
        Schema.decodeUnknownSync(CredentialEntrySchema)({ ...validEntry, active: "yes" }),
      ).toThrow();
    });
  });

  describe("RegistryAccountsSchema", () => {
    it("decodes a valid registry accounts map", () => {
      const input = {
        accounts: {
          alice: {
            access_token: "axm_ses_abc",
            refresh_token: "axm_ref_def",
            expires_at: "2026-03-12T10:30:00Z",
            active: true,
          },
        },
      };
      const result = Schema.decodeUnknownSync(RegistryAccountsSchema)(input);

      expect(result.accounts["alice"]?.active).toBe(true);
    });

    it("decodes multiple accounts", () => {
      const input = {
        accounts: {
          alice: {
            access_token: "a1",
            refresh_token: "r1",
            expires_at: "2026-01-01T00:00:00Z",
            active: true,
          },
          bob: {
            access_token: "a2",
            refresh_token: "r2",
            expires_at: "2026-01-01T00:00:00Z",
            active: false,
          },
        },
      };
      const result = Schema.decodeUnknownSync(RegistryAccountsSchema)(input);

      expect(Object.keys(result.accounts)).toHaveLength(2);
    });

    it("round-trips through encode/decode", () => {
      const input = {
        accounts: {
          alice: {
            access_token: "a1",
            refresh_token: "r1",
            expires_at: "2026-01-01T00:00:00Z",
            active: true,
          },
        },
      };
      const decoded = Schema.decodeUnknownSync(RegistryAccountsSchema)(input);
      const encoded = Schema.encodeSync(RegistryAccountsSchema)(decoded);

      expect(encoded).toEqual(input);
    });
  });

  describe("CredentialFileSchema", () => {
    const validFile = {
      version: 1 as const,
      registries: {
        "https://registry.agentxm.ai": {
          accounts: {
            alice: {
              access_token: "axm_ses_abc",
              refresh_token: "axm_ref_def",
              expires_at: "2026-03-12T10:30:00Z",
              active: true,
            },
          },
        },
      },
    };

    it("decodes a valid credential file", () => {
      const result = Schema.decodeUnknownSync(CredentialFileSchema)(validFile);

      expect(result.version).toBe(1);
      expect(
        result.registries["https://registry.agentxm.ai"]?.accounts["alice"]?.access_token,
      ).toBe("axm_ses_abc");
    });

    it("round-trips through encode/decode", () => {
      const decoded = Schema.decodeUnknownSync(CredentialFileSchema)(validFile);
      const encoded = Schema.encodeSync(CredentialFileSchema)(decoded);

      expect(encoded).toEqual(validFile);
    });

    it("decodes with multiple registries", () => {
      const input = {
        version: 1 as const,
        registries: {
          "https://registry.agentxm.ai": {
            accounts: {
              alice: {
                access_token: "a1",
                refresh_token: "r1",
                expires_at: "2026-01-01T00:00:00Z",
                active: true,
              },
            },
          },
          "https://registry.corp.com": {
            accounts: {
              bob: {
                access_token: "a2",
                refresh_token: "r2",
                expires_at: "2026-01-01T00:00:00Z",
                active: true,
              },
            },
          },
        },
      };
      const result = Schema.decodeUnknownSync(CredentialFileSchema)(input);

      expect(Object.keys(result.registries)).toHaveLength(2);
    });

    it("rejects invalid version", () => {
      expect(() =>
        Schema.decodeUnknownSync(CredentialFileSchema)({ ...validFile, version: 2 }),
      ).toThrow();
    });

    it("rejects missing version", () => {
      const { version: _, ...noVersion } = validFile;

      expect(() => Schema.decodeUnknownSync(CredentialFileSchema)(noVersion)).toThrow();
    });

    it("rejects missing registries", () => {
      expect(() => Schema.decodeUnknownSync(CredentialFileSchema)({ version: 1 })).toThrow();
    });

    it("decodes empty registries map", () => {
      const input = { version: 1 as const, registries: {} };
      const result = Schema.decodeUnknownSync(CredentialFileSchema)(input);

      expect(result.registries).toEqual({});
    });
  });

  describe("TokenSource tagged union", () => {
    it("creates EnvVar token source", () => {
      const source = new EnvVarTokenSource({ token: "axm_pat_abc" });

      expect(source._tag).toBe("EnvVar");
      expect(source.token).toBe("axm_pat_abc");
    });

    it("creates Flag token source", () => {
      const source = new FlagTokenSource({ token: "axm_pat_abc" });

      expect(source._tag).toBe("Flag");
      expect(source.token).toBe("axm_pat_abc");
    });

    it("creates CredentialStore token source", () => {
      const source = new CredentialStoreTokenSource({
        token: "axm_ses_abc",
        refresh_token: "axm_ref_def",
        expires_at: "2026-03-12T10:30:00Z",
        registryUrl: "https://registry.agentxm.ai",
      });

      expect(source._tag).toBe("CredentialStore");
      expect(source.token).toBe("axm_ses_abc");
      expect(source.refresh_token).toBe("axm_ref_def");
      expect(source.registryUrl).toBe("https://registry.agentxm.ai");
    });

    it("distinguishes token sources by tag", () => {
      const env = new EnvVarTokenSource({ token: "t1" });
      const flag = new FlagTokenSource({ token: "t2" });
      const store = new CredentialStoreTokenSource({
        token: "t3",
        refresh_token: "r3",
        expires_at: "2026-01-01T00:00:00Z",
        registryUrl: "https://example.com",
      });

      expect(env._tag).not.toBe(flag._tag);
      expect(flag._tag).not.toBe(store._tag);
      expect(env._tag).not.toBe(store._tag);
    });
  });
});
