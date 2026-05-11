/**
 * Unit tests for extension operation helpers.
 */

import { describe, expect, it } from "vitest";
import { formatPackageUrlParts, toLabelWithCompanions, toStepKey } from "./operations.js";
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

describe("toLabelWithCompanions", () => {
  it("returns base label when companionPackages is empty", () => {
    const result = toLabelWithCompanions({ type: "skill", name: "my-skill" }, []);
    expect(result).toBe("my-skill");
  });

  it("appends single companionPackage in parentheses", () => {
    const result = toLabelWithCompanions({ type: "skill", name: "react-testing" }, [
      packageUrl("pkg:npm/react"),
    ]);
    expect(result).toBe("react-testing (pkg:npm/react)");
  });

  it("appends multiple companionPackages comma-separated", () => {
    const result = toLabelWithCompanions({ type: "skill", name: "fullstack" }, [
      packageUrl("pkg:npm/react"),
      packageUrl("pkg:npm/typescript"),
    ]);
    expect(result).toBe("fullstack (pkg:npm/react, pkg:npm/typescript)");
  });

  it("works with pack targets", () => {
    const result = toLabelWithCompanions(
      { type: "pack", name: "frontend", owner: handle("@acme") },
      [packageUrl("pkg:npm/react")],
    );
    expect(result).toBe("@acme/frontend (pkg:npm/react)");
  });
});

describe("toStepKey", () => {
  it("includes the extension type for non-pack targets", () => {
    expect(toStepKey({ type: "skill", name: "lint" })).toBe("skill:lint");
    expect(toStepKey({ type: "command", name: "lint" })).toBe("command:lint");
  });

  it("includes the owner for pack targets", () => {
    expect(toStepKey({ type: "pack", name: "frontend", owner: handle("@acme") })).toBe(
      "pack:@acme/frontend",
    );
  });
});
