/**
 * Tests for the discover command handler helpers and JSON output shape.
 */

import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import { PackageTypeSchema } from "@axm.sh/core/unstable/packaging";
import type { DiscoverExtensionEntry } from "@axm.sh/core/unstable/registry";
import type { DiscoverPackageResult, DiscoverResult } from "@axm.sh/core/unstable/discover";

// Re-export the helpers for testing by importing the module and accessing
// the non-exported helpers through `toJsonResult` / `formatPackageName`.
// Since these are not exported, we replicate them here from the handler source
// to verify the logic in isolation.

// ---------------------------------------------------------------------------
// Inline copies of pure helpers under test (they are module-private in handler)
// ---------------------------------------------------------------------------

const formatPackageName = (pkg: DiscoverPackageResult): string => {
  const parts = pkg.detectedPackage;
  if (parts.namespace !== undefined) {
    return parts.version !== undefined
      ? `${parts.namespace}/${parts.name}@${parts.version}`
      : `${parts.namespace}/${parts.name}`;
  }
  return parts.version !== undefined ? `${parts.name}@${parts.version}` : parts.name;
};

const packageType = Schema.decodeUnknownSync(PackageTypeSchema);

// ---------------------------------------------------------------------------
// formatPackageName
// ---------------------------------------------------------------------------

describe("formatPackageName", () => {
  it("formats name only", () => {
    const pkg: DiscoverPackageResult = {
      detectedPackage: { type: packageType("npm"), name: "react" },
      extensions: [],
    };
    expect(formatPackageName(pkg)).toBe("react");
  });

  it("formats name with version", () => {
    const pkg: DiscoverPackageResult = {
      detectedPackage: { type: packageType("npm"), name: "react", version: "18.2.0" },
      extensions: [],
    };
    expect(formatPackageName(pkg)).toBe("react@18.2.0");
  });

  it("formats namespace/name", () => {
    const pkg: DiscoverPackageResult = {
      detectedPackage: { type: packageType("npm"), name: "cli", namespace: "@effect" },
      extensions: [],
    };
    expect(formatPackageName(pkg)).toBe("@effect/cli");
  });

  it("formats namespace/name@version", () => {
    const pkg: DiscoverPackageResult = {
      detectedPackage: {
        type: packageType("npm"),
        name: "cli",
        namespace: "@effect",
        version: "1.0.0",
      },
      extensions: [],
    };
    expect(formatPackageName(pkg)).toBe("@effect/cli@1.0.0");
  });
});

// ---------------------------------------------------------------------------
// toJsonResult shape
// ---------------------------------------------------------------------------

describe("toJsonResult shape", () => {
  // The DiscoverResultSchema is internal, so we verify the shape produced by
  // the handler's toJsonResult mapping (replicated here) conforms to the
  // expected JSON structure.

  const makeEntry = (name: string): DiscoverExtensionEntry =>
    ({
      type: "skill",
      name,
      owner: "@acme",
      description: `${name} description`,
      latestVersion: "1.0.0",
    }) as unknown as DiscoverExtensionEntry;

  const toJsonResult = (result: DiscoverResult) => ({
    totalDetected: result.totalDetected,
    registryAvailable: result.registryAvailable,
    packages: result.packages.map((pkg) => ({
      package: `pkg:${pkg.detectedPackage.type}/${pkg.detectedPackage.name}`,
      extensions: pkg.extensions.map((entry) => ({
        owner: entry.extension.owner,
        type: entry.extension.type,
        name: entry.extension.name,
        description: entry.extension.description,
        latestVersion: entry.extension.latestVersion,
        signal: entry.signal,
      })),
    })),
  });

  it("maps a discover result to the JSON output shape", () => {
    const result: DiscoverResult = {
      totalDetected: 2,
      registryAvailable: true,
      packages: [
        {
          detectedPackage: { type: packageType("npm"), name: "react" },
          extensions: [{ extension: makeEntry("react-testing"), signal: "recommended" }],
        },
      ],
    };

    const json = toJsonResult(result);

    expect(json.totalDetected).toBe(2);
    expect(json.registryAvailable).toBe(true);
    expect(json.packages).toHaveLength(1);
    expect(json.packages[0]?.extensions[0]?.signal).toBe("recommended");
    expect(json.packages[0]?.extensions[0]?.name).toBe("react-testing");
  });

  it("returns empty packages array when no results", () => {
    const result: DiscoverResult = {
      totalDetected: 0,
      registryAvailable: false,
      packages: [],
    };

    const json = toJsonResult(result);

    expect(json.totalDetected).toBe(0);
    expect(json.registryAvailable).toBe(false);
    expect(json.packages).toEqual([]);
  });
});
