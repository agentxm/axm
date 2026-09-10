import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RELEASE_PACKAGES } from "./release-shared.js";
import {
  RELEASE_COHORT_MANIFEST,
  validateReleaseCohort,
  validateReleaseCohortManifest,
} from "./release-packages.js";

const commit = "a".repeat(40);
const version = "1.2.3";
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const manifest = () => ({
  schemaVersion: 1,
  commit,
  version,
  packages: RELEASE_PACKAGES.map((pkg) => ({
    name: pkg.name,
    filename: `${pkg.tarballPrefix}${version}.tgz`,
    integrity: "sha512-candidate",
  })),
});

describe("release cohort artifact manifest", () => {
  it("accepts the complete fixed cohort for the exact commit and version", () => {
    expect(validateReleaseCohortManifest(manifest(), version, commit).packages).toHaveLength(
      RELEASE_PACKAGES.length,
    );
  });

  it("rejects wrong commit, wrong version, and incomplete metadata", () => {
    expect(() => validateReleaseCohortManifest(manifest(), version, "b".repeat(40))).toThrow(
      "commit",
    );
    expect(() => validateReleaseCohortManifest(manifest(), "1.2.4", commit)).toThrow("version");
    const incomplete = manifest();
    incomplete.packages.pop();
    expect(() => validateReleaseCohortManifest(incomplete, version, commit)).toThrow("incomplete");
  });

  it("rejects a renamed or duplicated cohort member", () => {
    const renamed = manifest();
    const first = renamed.packages[0];
    if (first === undefined) throw new Error("Expected release cohort package fixture.");
    first.filename = "wrong.tgz";
    expect(() => validateReleaseCohortManifest(renamed, version, commit)).toThrow(first.name);
  });

  it("rejects a tarball whose bytes do not match the recorded integrity", () => {
    const directory = mkdtempSync(join(tmpdir(), "axm-release-cohort-test-"));
    temporaryDirectories.push(directory);
    const candidate = manifest();
    writeFileSync(join(directory, RELEASE_COHORT_MANIFEST), JSON.stringify(candidate));
    const first = candidate.packages[0];
    if (first === undefined) throw new Error("Expected release cohort package fixture.");
    writeFileSync(join(directory, first.filename), "different bytes");

    expect(() => validateReleaseCohort(directory, version, commit)).toThrow(
      `Release cohort integrity mismatch: ${first.name}@${version}`,
    );
  });
});
