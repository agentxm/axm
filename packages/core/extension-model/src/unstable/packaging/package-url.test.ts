import * as Equivalence from "effect/Equivalence";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { packageType } from "../test-helpers.js";
import { formatPackageDisplay, PackageUrlPartsSchema, PackageUrlSchema } from "./package-url.js";

describe("PackageUrlSchema", () => {
  const decode = Schema.decodeUnknownResult(PackageUrlSchema);
  const encode = Schema.encodeResult(PackageUrlSchema);

  describe("valid purls decode to PackageUrlParts", () => {
    it("decodes a simple npm package", () => {
      const result = decode("pkg:npm/lodash@4.17.21");

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success.type).toBe("npm");
        expect(result.success.namespace).toBeUndefined();
        expect(result.success.name).toBe("lodash");
        expect(result.success.version).toBe("4.17.21");
      }
    });

    it("decodes a scoped npm package", () => {
      const result = decode("pkg:npm/%40angular/core@17.0.0");

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success.type).toBe("npm");
        expect(result.success.namespace).toBe("@angular");
        expect(result.success.name).toBe("core");
        expect(result.success.version).toBe("17.0.0");
      }
    });

    it("decodes a pypi package", () => {
      const result = decode("pkg:pypi/requests@2.31.0");

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success.type).toBe("pypi");
        expect(result.success.namespace).toBeUndefined();
        expect(result.success.name).toBe("requests");
        expect(result.success.version).toBe("2.31.0");
      }
    });

    it("decodes a purl without a version", () => {
      const result = decode("pkg:npm/express");

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success.type).toBe("npm");
        expect(result.success.name).toBe("express");
        expect(result.success.version).toBeUndefined();
      }
    });

    it("decodes a maven package with namespace", () => {
      const result = decode("pkg:maven/org.apache.commons/commons-lang3@3.14.0");

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success.type).toBe("maven");
        expect(result.success.namespace).toBe("org.apache.commons");
        expect(result.success.name).toBe("commons-lang3");
        expect(result.success.version).toBe("3.14.0");
      }
    });
  });

  describe("invalid strings rejected", () => {
    it("rejects an empty string", () => {
      const result = decode("");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects a plain package name", () => {
      const result = decode("lodash");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects a malformed purl", () => {
      const result = decode("pkg:");

      expect(Result.isFailure(result)).toBe(true);
    });

    it("rejects non-string input", () => {
      const result = decode(42);

      expect(Result.isFailure(result)).toBe(true);
    });
  });

  describe("scoped npm packages round-trip", () => {
    it("round-trips a scoped npm package", () => {
      const input = "pkg:npm/%40effect/platform@1.0.0";
      const decoded = decode(input);

      expect(Result.isSuccess(decoded)).toBe(true);
      if (Result.isSuccess(decoded)) {
        const encoded = encode(decoded.success);
        expect(Result.isSuccess(encoded)).toBe(true);
        if (Result.isSuccess(encoded)) {
          // Re-decode to verify structural equivalence
          const reDecoded = decode(encoded.success);
          expect(Result.isSuccess(reDecoded)).toBe(true);
          if (Result.isSuccess(reDecoded)) {
            expect(reDecoded.success).toEqual(decoded.success);
          }
        }
      }
    });
  });

  describe("qualifiers and subpath round-trip", () => {
    it("preserves qualifiers and subpath through decode and re-encode", () => {
      const input = "pkg:npm/react@18.2.0?extra=data#sub/path";
      const decoded = decode(input);

      expect(Result.isSuccess(decoded)).toBe(true);
      if (Result.isSuccess(decoded)) {
        expect(decoded.success).toEqual({
          type: "npm",
          name: "react",
          version: "18.2.0",
          qualifiers: { extra: "data" },
          subpath: "sub/path",
        });

        const encoded = encode(decoded.success);
        expect(Result.isSuccess(encoded)).toBe(true);
        if (Result.isSuccess(encoded)) {
          expect(encoded.success).toBe("pkg:npm/react@18.2.0?extra=data#sub/path");
        }
      }
    });

    it("preserves multi-key qualifiers on a scoped package", () => {
      const input = "pkg:maven/org.apache/commons-lang3@3.14.0?classifier=sources&type=jar";
      const decoded = decode(input);

      expect(Result.isSuccess(decoded)).toBe(true);
      if (Result.isSuccess(decoded)) {
        expect(decoded.success).toEqual({
          type: "maven",
          namespace: "org.apache",
          name: "commons-lang3",
          version: "3.14.0",
          qualifiers: { classifier: "sources", type: "jar" },
        });

        const encoded = encode(decoded.success);
        expect(Result.isSuccess(encoded)).toBe(true);
        if (Result.isSuccess(encoded)) {
          // Qualifier keys are sorted alphabetically in the canonical form.
          expect(encoded.success).toBe(
            "pkg:maven/org.apache/commons-lang3@3.14.0?classifier=sources&type=jar",
          );
        }
      }
    });

    it("normalises qualifier keys to lowercase", () => {
      const decoded = decode("pkg:npm/react@18.2.0?Repository_URL=https://example.com");

      expect(Result.isSuccess(decoded)).toBe(true);
      if (Result.isSuccess(decoded)) {
        expect(decoded.success.qualifiers).toEqual({
          repository_url: "https://example.com",
        });
      }
    });

    it("omits qualifiers field when no qualifiers are present", () => {
      const decoded = decode("pkg:npm/react@18.2.0");

      expect(Result.isSuccess(decoded)).toBe(true);
      if (Result.isSuccess(decoded)) {
        expect(decoded.success).not.toHaveProperty("qualifiers");
        expect(decoded.success).not.toHaveProperty("subpath");
      }
    });
  });

  describe("encode roundtrip produces canonical form", () => {
    it("normalizes PKG:NPM/React to canonical lowercase", () => {
      const decoded = decode("PKG:NPM/React");

      expect(Result.isSuccess(decoded)).toBe(true);
      if (Result.isSuccess(decoded)) {
        const encoded = encode(decoded.success);
        expect(Result.isSuccess(encoded)).toBe(true);
        if (Result.isSuccess(encoded)) {
          // purl spec normalizes type to lowercase
          expect(encoded.success).toBe("pkg:npm/react");
        }
      }
    });

    it("normalizes mixed-case type", () => {
      const decoded = decode("pkg:NPM/lodash@4.0.0");

      expect(Result.isSuccess(decoded)).toBe(true);
      if (Result.isSuccess(decoded)) {
        const encoded = encode(decoded.success);
        expect(Result.isSuccess(encoded)).toBe(true);
        if (Result.isSuccess(encoded)) {
          expect(encoded.success).toBe("pkg:npm/lodash@4.0.0");
        }
      }
    });
  });
});

describe("formatPackageDisplay", () => {
  it("formats a simple npm package", () => {
    expect(formatPackageDisplay({ type: packageType("npm"), name: "react" })).toBe("react (npm)");
  });

  it("formats a pypi package", () => {
    expect(formatPackageDisplay({ type: packageType("pypi"), name: "requests" })).toBe(
      "requests (pypi)",
    );
  });

  it("formats a package with version (version not shown)", () => {
    expect(
      formatPackageDisplay({ type: packageType("npm"), name: "react", version: "18.0.0" }),
    ).toBe("react (npm)");
  });

  it("formats a package with namespace (namespace not shown)", () => {
    expect(
      formatPackageDisplay({ type: packageType("npm"), namespace: "@angular", name: "core" }),
    ).toBe("core (npm)");
  });
});

describe("PackageUrlPartsSchema structural equivalence", () => {
  const equivalence: Equivalence.Equivalence<Schema.Schema.Type<typeof PackageUrlPartsSchema>> =
    Schema.toEquivalence(PackageUrlPartsSchema);

  it("identifies identical packages as equal", () => {
    const decode = Schema.decodeUnknownSync(PackageUrlPartsSchema);
    const a = decode({ type: "npm", name: "lodash", version: "4.17.21" });
    const b = decode({ type: "npm", name: "lodash", version: "4.17.21" });

    expect(equivalence(a, b)).toBe(true);
  });

  it("distinguishes different package names", () => {
    const decode = Schema.decodeUnknownSync(PackageUrlPartsSchema);
    const a = decode({ type: "npm", name: "lodash" });
    const b = decode({ type: "npm", name: "express" });

    expect(equivalence(a, b)).toBe(false);
  });

  it("distinguishes different package types", () => {
    const decode = Schema.decodeUnknownSync(PackageUrlPartsSchema);
    const a = decode({ type: "npm", name: "requests" });
    const b = decode({ type: "pypi", name: "requests" });

    expect(equivalence(a, b)).toBe(false);
  });

  it("distinguishes different versions", () => {
    const decode = Schema.decodeUnknownSync(PackageUrlPartsSchema);
    const a = decode({ type: "npm", name: "lodash", version: "4.17.21" });
    const b = decode({ type: "npm", name: "lodash", version: "4.17.20" });

    expect(equivalence(a, b)).toBe(false);
  });

  it("handles optional namespace correctly", () => {
    const decode = Schema.decodeUnknownSync(PackageUrlPartsSchema);
    const a = decode({ type: "npm", namespace: "@angular", name: "core" });
    const b = decode({ type: "npm", name: "core" });

    expect(equivalence(a, b)).toBe(false);
  });

  it("treats matching optional fields as equal", () => {
    const decode = Schema.decodeUnknownSync(PackageUrlPartsSchema);
    const a = decode({ type: "npm", namespace: "@angular", name: "core", version: "17.0.0" });
    const b = decode({ type: "npm", namespace: "@angular", name: "core", version: "17.0.0" });

    expect(equivalence(a, b)).toBe(true);
  });

  it("treats both-absent optional version as equal", () => {
    const decode = Schema.decodeUnknownSync(PackageUrlPartsSchema);
    const a = decode({ type: "npm", name: "lodash" });
    const b = decode({ type: "npm", name: "lodash" });

    expect(equivalence(a, b)).toBe(true);
  });
});
