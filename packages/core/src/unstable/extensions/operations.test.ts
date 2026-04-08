/**
 * Unit tests for extension operation helpers.
 */

import { describe, expect, it } from "vitest";
import { formatPackageUrlParts, toLabelWithCompatibility } from "./operations.js";
import { handle, packageUrl } from "../test-helpers.js";

describe("formatPackageUrlParts", () => {
  it("formats type and name", () => {
    const parts = packageUrl("pkg:npm/react");
    expect(formatPackageUrlParts(parts)).toBe("pkg:npm/react");
  });

  it("includes namespace when present", () => {
    const parts = packageUrl("pkg:npm/%40angular/core");
    expect(formatPackageUrlParts(parts)).toBe("pkg:npm/@angular/core");
  });

  it("includes version when present", () => {
    const parts = packageUrl("pkg:npm/react@18.2.0");
    expect(formatPackageUrlParts(parts)).toBe("pkg:npm/react@18.2.0");
  });

  it("includes namespace and version together", () => {
    const parts = packageUrl("pkg:npm/%40angular/core@18.0.0");
    expect(formatPackageUrlParts(parts)).toBe("pkg:npm/@angular/core@18.0.0");
  });

  it("handles pypi type", () => {
    const parts = packageUrl("pkg:pypi/django");
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
      packageUrl("pkg:npm/react"),
    ]);
    expect(result).toBe("react-testing (pkg:npm/react)");
  });

  it("appends multiple compatiblePackages comma-separated", () => {
    const result = toLabelWithCompatibility({ type: "skill", name: "fullstack" }, [
      packageUrl("pkg:npm/react"),
      packageUrl("pkg:npm/typescript"),
    ]);
    expect(result).toBe("fullstack (pkg:npm/react, pkg:npm/typescript)");
  });

  it("works with pack targets", () => {
    const result = toLabelWithCompatibility(
      { type: "pack", name: "frontend", owner: handle("@acme") },
      [packageUrl("pkg:npm/react")],
    );
    expect(result).toBe("@acme/frontend (pkg:npm/react)");
  });
});
