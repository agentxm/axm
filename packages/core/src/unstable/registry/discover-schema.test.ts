import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import {
  DiscoverExtensionEntrySchema,
  DiscoverExtensionsResponseSchema,
} from "./discover-schema.js";

describe("discover-schema", () => {
  describe("DiscoverExtensionEntrySchema", () => {
    const validEntry = {
      type: "skill",
      name: "code-review",
      owner: "@acme",
      description: "Automated code review",
      latestVersion: "1.2.3",
    };

    it("accepts a valid entry", () => {
      const result = Schema.decodeUnknownSync(DiscoverExtensionEntrySchema)(validEntry);

      expect(result.type).toBe("skill");
      expect(result.name).toBe("code-review");
      expect(result.owner).toBe("@acme");
      expect(result.description).toBe("Automated code review");
      expect(result.latestVersion).toBe("1.2.3");
    });

    it("roundtrips through encode/decode", () => {
      const decoded = Schema.decodeUnknownSync(DiscoverExtensionEntrySchema)(validEntry);
      const encoded = Schema.encodeSync(DiscoverExtensionEntrySchema)(decoded);
      const reDecoded = Schema.decodeUnknownSync(DiscoverExtensionEntrySchema)(encoded);

      expect(reDecoded).toEqual(decoded);
    });

    it("rejects missing required fields", () => {
      expect(() =>
        Schema.decodeUnknownSync(DiscoverExtensionEntrySchema)({ type: "skill" }),
      ).toThrow();
    });

    it("rejects invalid extension type", () => {
      expect(() =>
        Schema.decodeUnknownSync(DiscoverExtensionEntrySchema)({
          ...validEntry,
          type: "invalid",
        }),
      ).toThrow();
    });

    it("rejects invalid owner handle", () => {
      expect(() =>
        Schema.decodeUnknownSync(DiscoverExtensionEntrySchema)({
          ...validEntry,
          owner: "no-at-prefix",
        }),
      ).toThrow();
    });

    it("rejects invalid semver version", () => {
      expect(() =>
        Schema.decodeUnknownSync(DiscoverExtensionEntrySchema)({
          ...validEntry,
          latestVersion: "not-semver",
        }),
      ).toThrow();
    });

    it("does not include a signal field", () => {
      const decoded = Schema.decodeUnknownSync(DiscoverExtensionEntrySchema)(validEntry);
      expect("signal" in decoded).toBe(false);
    });
  });

  describe("DiscoverExtensionsResponseSchema", () => {
    const makeEntry = (overrides?: Record<string, unknown>) => ({
      type: "skill",
      name: "code-review",
      owner: "@acme",
      description: "Automated code review",
      latestVersion: "1.0.0",
      ...overrides,
    });

    const validResponse = {
      results: [
        {
          detectedPackage: "pkg:npm/react@18.2.0",
          extensions: [makeEntry(), makeEntry({ name: "lint-helper", latestVersion: "2.0.0" })],
        },
        {
          detectedPackage: "pkg:pypi/django",
          extensions: [makeEntry({ name: "django-skill", type: "mcp-server" })],
        },
      ],
      resolvedRecommendations: [makeEntry({ name: "recommended-skill", latestVersion: "3.0.0" })],
    };

    it("accepts a valid response", () => {
      const result = Schema.decodeUnknownSync(DiscoverExtensionsResponseSchema)(validResponse);

      expect(result.results).toHaveLength(2);
      expect(result.resolvedRecommendations).toHaveLength(1);
    });

    it("groups results by detectedPackage", () => {
      const result = Schema.decodeUnknownSync(DiscoverExtensionsResponseSchema)(validResponse);

      expect(result.results[0]?.detectedPackage.type).toBe("npm");
      expect(result.results[0]?.detectedPackage.name).toBe("react");
      expect(result.results[0]?.extensions).toHaveLength(2);

      expect(result.results[1]?.detectedPackage.type).toBe("pypi");
      expect(result.results[1]?.detectedPackage.name).toBe("django");
      expect(result.results[1]?.extensions).toHaveLength(1);
    });

    it("keeps resolvedRecommendations as a flat list", () => {
      const result = Schema.decodeUnknownSync(DiscoverExtensionsResponseSchema)(validResponse);

      expect(Array.isArray(result.resolvedRecommendations)).toBe(true);
      expect(result.resolvedRecommendations[0]?.name).toBe("recommended-skill");
    });

    it("roundtrips through encode/decode", () => {
      const decoded = Schema.decodeUnknownSync(DiscoverExtensionsResponseSchema)(validResponse);
      const encoded = Schema.encodeSync(DiscoverExtensionsResponseSchema)(decoded);
      const reDecoded = Schema.decodeUnknownSync(DiscoverExtensionsResponseSchema)(encoded);

      expect(reDecoded).toEqual(decoded);
    });

    it("does not include a signal field in entries", () => {
      const result = Schema.decodeUnknownSync(DiscoverExtensionsResponseSchema)(validResponse);

      for (const group of result.results) {
        for (const entry of group.extensions) {
          expect("signal" in entry).toBe(false);
        }
      }
      for (const entry of result.resolvedRecommendations) {
        expect("signal" in entry).toBe(false);
      }
    });

    it("accepts empty results and recommendations", () => {
      const result = Schema.decodeUnknownSync(DiscoverExtensionsResponseSchema)({
        results: [],
        resolvedRecommendations: [],
      });

      expect(result.results).toEqual([]);
      expect(result.resolvedRecommendations).toEqual([]);
    });

    it("rejects missing results field", () => {
      expect(() =>
        Schema.decodeUnknownSync(DiscoverExtensionsResponseSchema)({
          resolvedRecommendations: [],
        }),
      ).toThrow();
    });

    it("rejects missing resolvedRecommendations field", () => {
      expect(() =>
        Schema.decodeUnknownSync(DiscoverExtensionsResponseSchema)({
          results: [],
        }),
      ).toThrow();
    });

    it("rejects invalid detectedPackage purl", () => {
      expect(() =>
        Schema.decodeUnknownSync(DiscoverExtensionsResponseSchema)({
          results: [
            {
              detectedPackage: "not-a-purl",
              extensions: [],
            },
          ],
          resolvedRecommendations: [],
        }),
      ).toThrow();
    });
  });
});
