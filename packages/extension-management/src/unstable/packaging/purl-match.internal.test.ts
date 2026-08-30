/**
 * Tests for purl matching functions.
 *
 * Verifies purlMatch and purlIdentityMatch per Design Decision 4:
 * - versionless declaration matches any detected version
 * - versionless detection matches any declaration
 * - both exact versions match only if equal
 * - both versionless always match
 * - namespace presence/absence handled correctly
 * - different package types do not match
 */

import { describe, expect, it } from "vitest";
import { packageType } from "../test-helpers.js";
import type { PackageUrlParts } from "@agentxm/extension-model/unstable/packaging/package-url";
import { purlIdentityMatch, purlMatch } from "./purl-match.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeParts = (overrides?: Partial<PackageUrlParts>): PackageUrlParts => ({
  type: packageType("npm"),
  name: "react",
  ...overrides,
});

// -----------------------------------------------------------------------------
// purlIdentityMatch
// -----------------------------------------------------------------------------

describe("purlIdentityMatch", () => {
  it("matches identical type + name", () => {
    expect(purlIdentityMatch(makeParts(), makeParts())).toBe(true);
  });

  it("matches identical type + namespace + name", () => {
    const a = makeParts({ namespace: "@angular", name: "core" });
    const b = makeParts({ namespace: "@angular", name: "core" });
    expect(purlIdentityMatch(a, b)).toBe(true);
  });

  it("does not match different types", () => {
    expect(
      purlIdentityMatch(
        makeParts({ type: packageType("npm") }),
        makeParts({ type: packageType("pypi") }),
      ),
    ).toBe(false);
  });

  it("does not match different names", () => {
    expect(purlIdentityMatch(makeParts({ name: "react" }), makeParts({ name: "vue" }))).toBe(false);
  });

  it("does not match when one has namespace and the other does not", () => {
    const withNs = makeParts({ namespace: "@angular", name: "core" });
    const withoutNs = makeParts({ name: "core" });
    expect(purlIdentityMatch(withNs, withoutNs)).toBe(false);
  });

  it("does not match different namespaces", () => {
    const a = makeParts({ namespace: "@angular", name: "core" });
    const b = makeParts({ namespace: "@vue", name: "core" });
    expect(purlIdentityMatch(a, b)).toBe(false);
  });

  it("ignores version in identity comparison", () => {
    const a = makeParts({ version: "1.0.0" });
    const b = makeParts({ version: "2.0.0" });
    expect(purlIdentityMatch(a, b)).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// purlMatch
// -----------------------------------------------------------------------------

describe("purlMatch", () => {
  describe("versionless declaration matches any detected version", () => {
    it("matches when declaration has no version and detection has a version", () => {
      const detected = makeParts({ version: "18.2.0" });
      const declared = makeParts(); // no version
      expect(purlMatch(detected, declared)).toBe(true);
    });
  });

  describe("versionless detection matches any declaration", () => {
    it("matches when detection has no version and declaration has a version", () => {
      const detected = makeParts(); // no version
      const declared = makeParts({ version: "18.0.0" });
      expect(purlMatch(detected, declared)).toBe(true);
    });
  });

  describe("both versionless always match", () => {
    it("matches when both have no version", () => {
      const detected = makeParts();
      const declared = makeParts();
      expect(purlMatch(detected, declared)).toBe(true);
    });
  });

  describe("both exact versions match only if equal", () => {
    it("matches when both have the same version", () => {
      const detected = makeParts({ version: "18.2.0" });
      const declared = makeParts({ version: "18.2.0" });
      expect(purlMatch(detected, declared)).toBe(true);
    });

    it("does not match when versions differ", () => {
      const detected = makeParts({ version: "18.2.0" });
      const declared = makeParts({ version: "17.0.0" });
      expect(purlMatch(detected, declared)).toBe(false);
    });
  });

  describe("identity mismatch prevents match", () => {
    it("does not match different package types", () => {
      const detected = makeParts({ type: packageType("pypi") });
      const declared = makeParts({ type: packageType("npm") });
      expect(purlMatch(detected, declared)).toBe(false);
    });

    it("does not match different names", () => {
      const detected = makeParts({ name: "react" });
      const declared = makeParts({ name: "vue" });
      expect(purlMatch(detected, declared)).toBe(false);
    });

    it("does not match when namespace presence differs", () => {
      const detected = makeParts({ namespace: "@angular", name: "core" });
      const declared = makeParts({ name: "core" });
      expect(purlMatch(detected, declared)).toBe(false);
    });
  });

  describe("namespace handling", () => {
    it("matches scoped packages with same namespace", () => {
      const detected = makeParts({ namespace: "@angular", name: "core", version: "17.0.0" });
      const declared = makeParts({ namespace: "@angular", name: "core" });
      expect(purlMatch(detected, declared)).toBe(true);
    });

    it("does not match scoped packages with different namespace", () => {
      const detected = makeParts({ namespace: "@angular", name: "core" });
      const declared = makeParts({ namespace: "@vue", name: "core" });
      expect(purlMatch(detected, declared)).toBe(false);
    });
  });
});
