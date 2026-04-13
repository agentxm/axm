/**
 * Unit tests for skill install command-actions helpers.
 *
 * Verifies compatible packages extraction and plan section building
 * for the `--preview` display.
 */

import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { normalizeHandle } from "@agentxm/client-core/unstable/extensions";
import type { RegistrySkillRef, LocalSkillRef } from "@agentxm/client-core/unstable/skills";
import { PackageTypeSchema, type PackageUrlParts } from "@agentxm/client-core/unstable/packaging";
import { exactVersion, extensionName } from "../../../test-stubs.js";
import { getCompatiblePackages, buildCompatiblePackagesSection } from "./command-actions.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const ACME = normalizeHandle("@acme");

const makeRegistrySkillRef = (
  name: string,
  compatiblePackages: ReadonlyArray<PackageUrlParts> = [],
): RegistrySkillRef => ({
  type: "skill",
  refType: "registry",
  skill: {
    name: extensionName(name),
    description: Option.some(`${name} skill`),
    metadata: Option.none(),
  },
  source: {
    type: "registry",
    location: new URL("https://registry.example.com"),
    owner: Option.none(),
  },
  owner: ACME,
  name: extensionName(name),
  version: exactVersion("1.0.0"),
  integrity: Option.some("sha512-deadbeef"),
  compatiblePackages,
});

const makeLocalSkillRef = (name: string, metadata?: Record<string, unknown>): LocalSkillRef => ({
  type: "skill",
  refType: "local",
  skill: {
    name: extensionName(name),
    description: Option.some(`${name} skill`),
    metadata: metadata !== undefined ? Option.some(metadata) : Option.none(),
  },
  source: { type: "local", path: "/fake" },
  location: `file:///fake/${name}`,
});

const packageType = Schema.decodeUnknownSync(PackageTypeSchema);

const reactPkg: PackageUrlParts = { type: packageType("npm"), name: "react" };
const reactDomPkg: PackageUrlParts = { type: packageType("npm"), name: "react-dom" };

// -----------------------------------------------------------------------------
// getCompatiblePackages
// -----------------------------------------------------------------------------

describe("getCompatiblePackages", () => {
  it("returns compatiblePackages from a registry skill ref", () => {
    const ref = makeRegistrySkillRef("react-testing", [reactPkg, reactDomPkg]);
    expect(getCompatiblePackages(ref)).toEqual([reactPkg, reactDomPkg]);
  });

  it("returns empty array from a registry skill ref with no compatible packages", () => {
    const ref = makeRegistrySkillRef("general-review");
    expect(getCompatiblePackages(ref)).toEqual([]);
  });

  it("extracts compatiblePackages from local skill ref metadata", () => {
    const ref = makeLocalSkillRef("react-testing", {
      compatiblePackages: [reactPkg, reactDomPkg],
    });
    expect(getCompatiblePackages(ref)).toEqual([reactPkg, reactDomPkg]);
  });

  it("returns empty array from local skill ref with no metadata", () => {
    const ref = makeLocalSkillRef("general-review");
    expect(getCompatiblePackages(ref)).toEqual([]);
  });

  it("returns empty array from local skill ref with metadata lacking compatiblePackages", () => {
    const ref = makeLocalSkillRef("general-review", { internal: true });
    expect(getCompatiblePackages(ref)).toEqual([]);
  });

  it("filters out invalid entries from metadata compatiblePackages", () => {
    const ref = makeLocalSkillRef("mixed", {
      compatiblePackages: [reactPkg, "not-an-object", null, { noType: true }],
    });
    expect(getCompatiblePackages(ref)).toEqual([reactPkg]);
  });

  it("returns empty array when metadata entries have partial fields missing required name", () => {
    const ref = makeLocalSkillRef("partial-fields", {
      compatiblePackages: [{ type: "npm" }],
    });
    expect(getCompatiblePackages(ref)).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// buildCompatiblePackagesSection
// -----------------------------------------------------------------------------

describe("buildCompatiblePackagesSection", () => {
  it("returns a section with formatted package names when packages present", () => {
    const section = buildCompatiblePackagesSection([
      makeRegistrySkillRef("react-testing", [reactPkg, reactDomPkg]),
    ]);

    expect(section).toBeDefined();
    expect(section?.title).toBe("Compatible packages");
    expect(section?.items).toEqual(["react (npm)", "react-dom (npm)"]);
  });

  it("returns undefined when no skill has compatible packages", () => {
    const section = buildCompatiblePackagesSection([makeRegistrySkillRef("general-review")]);

    expect(section).toBeUndefined();
  });

  it("returns undefined for empty refs array", () => {
    const section = buildCompatiblePackagesSection([]);
    expect(section).toBeUndefined();
  });

  it("deduplicates packages across multiple skills", () => {
    const section = buildCompatiblePackagesSection([
      makeRegistrySkillRef("skill-a", [reactPkg]),
      makeRegistrySkillRef("skill-b", [reactPkg, reactDomPkg]),
    ]);

    expect(section?.items).toEqual(["react (npm)", "react-dom (npm)"]);
  });

  it("aggregates packages from registry and local refs", () => {
    const expressPkg: PackageUrlParts = { type: packageType("npm"), name: "express" };
    const section = buildCompatiblePackagesSection([
      makeRegistrySkillRef("skill-a", [reactPkg]),
      makeLocalSkillRef("skill-b", { compatiblePackages: [expressPkg] }),
    ]);

    expect(section?.items).toEqual(["react (npm)", "express (npm)"]);
  });
});
