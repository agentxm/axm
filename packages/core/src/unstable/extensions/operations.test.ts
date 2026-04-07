/**
 * Unit tests for extension operation helpers.
 */

import { describe, expect, it } from "vitest";
import { formatPackageUrlParts, toLabelWithCompatibility } from "./operations.js";
import type { PackageUrlParts } from "../packaging/package-url.js";

describe("formatPackageUrlParts", () => {
  it("formats type and name", () => {
    const parts: PackageUrlParts = { type: "npm", name: "react" };
    expect(formatPackageUrlParts(parts)).toBe("pkg:npm/react");
  });

  it("includes namespace when present", () => {
    const parts: PackageUrlParts = { type: "npm", namespace: "@angular", name: "core" };
    expect(formatPackageUrlParts(parts)).toBe("pkg:npm/@angular/core");
  });

  it("includes version when present", () => {
    const parts: PackageUrlParts = { type: "npm", name: "react", version: "18.2.0" };
    expect(formatPackageUrlParts(parts)).toBe("pkg:npm/react@18.2.0");
  });

  it("includes namespace and version together", () => {
    const parts: PackageUrlParts = {
      type: "npm",
      namespace: "@angular",
      name: "core",
      version: "18.0.0",
    };
    expect(formatPackageUrlParts(parts)).toBe("pkg:npm/@angular/core@18.0.0");
  });

  it("handles pypi type", () => {
    const parts: PackageUrlParts = { type: "pypi", name: "django" };
    expect(formatPackageUrlParts(parts)).toBe("pkg:pypi/django");
  });
});

describe("toLabelWithCompatibility", () => {
  it("returns base label when compatiblePackages is empty", () => {
    const result = toLabelWithCompatibility({ type: "skill", name: "my-skill" }, []);
    expect(result).toBe("my-skill");
  });

  it("appends single compatiblePackage in parentheses", () => {
    const result = toLabelWithCompatibility({ type: "skill", name: "react-testing" }, [
      { type: "npm", name: "react" },
    ]);
    expect(result).toBe("react-testing (pkg:npm/react)");
  });

  it("appends multiple compatiblePackages comma-separated", () => {
    const result = toLabelWithCompatibility({ type: "skill", name: "fullstack" }, [
      { type: "npm", name: "react" },
      { type: "npm", name: "typescript" },
    ]);
    expect(result).toBe("fullstack (pkg:npm/react, pkg:npm/typescript)");
  });

  it("works with pack targets", () => {
    const result = toLabelWithCompatibility({ type: "pack", name: "frontend", owner: "@acme" }, [
      { type: "npm", name: "react" },
    ]);
    expect(result).toBe("@acme/frontend (pkg:npm/react)");
  });
});
