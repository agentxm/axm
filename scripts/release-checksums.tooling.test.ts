import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  EXPECTED_BINARY_ASSETS,
  generateReleaseChecksums,
  parseChecksumManifest,
  validateReleaseAssets,
} from "./release-checksums.js";

const directories: Array<string> = [];

const fixtureDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "axm-release-checksums-"));
  directories.push(directory);
  for (const name of EXPECTED_BINARY_ASSETS) {
    writeFileSync(join(directory, name), `contents:${name}`);
  }
  return directory;
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("release checksums", () => {
  it("generates a deterministic manifest for exactly five binaries", () => {
    const directory = fixtureDirectory();
    generateReleaseChecksums(directory);

    const manifest = readFileSync(join(directory, "SHA256SUMS"), "utf8");
    const lines = manifest.trimEnd().split("\n");
    expect(lines).toHaveLength(5);
    expect(lines.map((line) => line.slice(66))).toEqual([...EXPECTED_BINARY_ASSETS].sort());
    expect(validateReleaseAssets(directory)).toEqual({ assetCount: 6, binaryCount: 5 });
  });

  it.each([
    ["malformed", "not-a-checksum  axm-linux-x64\n"],
    ["duplicate", `${"0".repeat(64)}  axm-linux-x64\n${"1".repeat(64)}  axm-linux-x64\n`],
    ["unexpected", `${"0".repeat(64)}  surprise-binary\n`],
  ])("rejects a %s manifest", (_label, manifest) => {
    expect(() => parseChecksumManifest(manifest)).toThrow();
  });

  it("rejects a missing manifest", () => {
    expect(() => validateReleaseAssets(fixtureDirectory())).toThrow(/SHA256SUMS/u);
  });

  it("rejects missing, unexpected, and checksum-mismatched files", () => {
    const missing = fixtureDirectory();
    generateReleaseChecksums(missing);
    rmSync(join(missing, EXPECTED_BINARY_ASSETS[0]));
    expect(() => validateReleaseAssets(missing)).toThrow(/missing/u);

    const unexpected = fixtureDirectory();
    generateReleaseChecksums(unexpected);
    writeFileSync(join(unexpected, "extra"), "unexpected");
    expect(() => validateReleaseAssets(unexpected)).toThrow(/unexpected/u);

    const mismatched = fixtureDirectory();
    generateReleaseChecksums(mismatched);
    writeFileSync(join(mismatched, EXPECTED_BINARY_ASSETS[0]), "changed");
    expect(() => validateReleaseAssets(mismatched)).toThrow(/checksum mismatch/u);
  });
});
