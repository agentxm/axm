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
import { getCompanionPackages, buildCompanionPackagesSection } from "./command-actions.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const ACME = normalizeHandle("@acme");

const makeRegistrySkillRef = (
  name: string,
  packages: ReadonlyArray<PackageUrlParts> = [],
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
  packages,
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
// getCompanionPackages
// -----------------------------------------------------------------------------

describe("getCompanionPackages", () => {
  it("returns packages from a registry skill ref", () => {
    const ref = makeRegistrySkillRef("react-testing", [reactPkg, reactDomPkg]);
    expect(getCompanionPackages(ref)).toEqual([reactPkg, reactDomPkg]);
  });

  it("returns empty array from a registry skill ref with no compatible packages", () => {
    const ref = makeRegistrySkillRef("general-review");
    expect(getCompanionPackages(ref)).toEqual([]);
  });

  it("extracts packages from local skill ref metadata", () => {
    const ref = makeLocalSkillRef("react-testing", {
      packages: [reactPkg, reactDomPkg],
    });
    expect(getCompanionPackages(ref)).toEqual([reactPkg, reactDomPkg]);
  });

  it("returns empty array from local skill ref with no metadata", () => {
    const ref = makeLocalSkillRef("general-review");
    expect(getCompanionPackages(ref)).toEqual([]);
  });

  it("returns empty array from local skill ref with metadata lacking packages", () => {
    const ref = makeLocalSkillRef("general-review", { internal: true });
    expect(getCompanionPackages(ref)).toEqual([]);
  });

  it("filters out invalid entries from metadata packages", () => {
    const ref = makeLocalSkillRef("mixed", {
      packages: [reactPkg, "not-an-object", null, { noType: true }],
    });
    expect(getCompanionPackages(ref)).toEqual([reactPkg]);
  });

  it("returns empty array when metadata entries have partial fields missing required name", () => {
    const ref = makeLocalSkillRef("partial-fields", {
      packages: [{ type: "npm" }],
    });
    expect(getCompanionPackages(ref)).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// buildCompanionPackagesSection
// -----------------------------------------------------------------------------

describe("buildCompanionPackagesSection", () => {
  it("returns a section with formatted package names when packages present", () => {
    const section = buildCompanionPackagesSection([
      makeRegistrySkillRef("react-testing", [reactPkg, reactDomPkg]),
    ]);

    expect(section).toBeDefined();
    expect(section?.title).toBe("Compatible packages");
    expect(section?.items).toEqual(["react (npm)", "react-dom (npm)"]);
  });

  it("returns undefined when no skill has compatible packages", () => {
    const section = buildCompanionPackagesSection([makeRegistrySkillRef("general-review")]);

    expect(section).toBeUndefined();
  });

  it("returns undefined for empty refs array", () => {
    const section = buildCompanionPackagesSection([]);
    expect(section).toBeUndefined();
  });

  it("deduplicates packages across multiple skills", () => {
    const section = buildCompanionPackagesSection([
      makeRegistrySkillRef("skill-a", [reactPkg]),
      makeRegistrySkillRef("skill-b", [reactPkg, reactDomPkg]),
    ]);

    expect(section?.items).toEqual(["react (npm)", "react-dom (npm)"]);
  });

  it("aggregates packages from registry and local refs", () => {
    const expressPkg: PackageUrlParts = { type: packageType("npm"), name: "express" };
    const section = buildCompanionPackagesSection([
      makeRegistrySkillRef("skill-a", [reactPkg]),
      makeLocalSkillRef("skill-b", { packages: [expressPkg] }),
    ]);

    expect(section?.items).toEqual(["react (npm)", "express (npm)"]);
  });
});
