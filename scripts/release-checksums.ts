import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_BINARY_ASSETS = [
  "axm-darwin-arm64",
  "axm-darwin-x64",
  "axm-linux-arm64",
  "axm-linux-x64",
  "axm-windows-x64.exe",
] as const;

export const CHECKSUM_MANIFEST = "SHA256SUMS";

const checksumPattern = /^([0-9a-f]{64}) {2}([A-Za-z0-9._-]+)$/u;
const expectedBinaryNames: ReadonlySet<string> = new Set(EXPECTED_BINARY_ASSETS);

const sha256File = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

export const parseChecksumManifest = (content: string): ReadonlyMap<string, string> => {
  const entries = new Map<string, string>();
  const lines = content.split(/\r?\n/u).filter((line) => line.length > 0);
  for (const line of lines) {
    const match = checksumPattern.exec(line);
    const checksum = match?.[1];
    const name = match?.[2];
    if (checksum === undefined || name === undefined || basename(name) !== name) {
      throw new Error(`Malformed ${CHECKSUM_MANIFEST} entry`);
    }
    if (!expectedBinaryNames.has(name)) {
      throw new Error(`Unexpected ${CHECKSUM_MANIFEST} entry: ${name}`);
    }
    if (entries.has(name)) {
      throw new Error(`Duplicate ${CHECKSUM_MANIFEST} entry: ${name}`);
    }
    entries.set(name, checksum);
  }
  return entries;
};

const requireBinaries = (directory: string): void => {
  for (const name of EXPECTED_BINARY_ASSETS) {
    const path = join(directory, name);
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new Error(`Release asset is missing: ${name}`);
    }
  }
};

export const generateReleaseChecksums = (directory: string): void => {
  requireBinaries(directory);
  const lines = [...EXPECTED_BINARY_ASSETS]
    .sort()
    .map((name) => `${sha256File(join(directory, name))}  ${name}`);
  writeFileSync(join(directory, CHECKSUM_MANIFEST), `${lines.join("\n")}\n`, {
    encoding: "utf8",
    flag: "w",
  });
};

export const validateReleaseAssets = (
  directory: string,
): { readonly assetCount: number; readonly binaryCount: number } => {
  requireBinaries(directory);
  const manifestPath = join(directory, CHECKSUM_MANIFEST);
  if (!existsSync(manifestPath)) {
    throw new Error(`Release asset is missing: ${CHECKSUM_MANIFEST}`);
  }

  const actualFiles = readdirSync(directory).filter((name) =>
    statSync(join(directory, name)).isFile(),
  );
  const expectedFiles = new Set([...EXPECTED_BINARY_ASSETS, CHECKSUM_MANIFEST]);
  const unexpected = actualFiles.filter((name) => !expectedFiles.has(name));
  if (unexpected.length > 0) {
    throw new Error(`Release asset is unexpected: ${unexpected.sort().join(", ")}`);
  }
  if (actualFiles.length !== expectedFiles.size) {
    throw new Error(
      `Expected ${String(expectedFiles.size)} release assets, found ${String(actualFiles.length)}`,
    );
  }

  const entries = parseChecksumManifest(readFileSync(manifestPath, "utf8"));
  if (entries.size !== EXPECTED_BINARY_ASSETS.length) {
    throw new Error(
      `${CHECKSUM_MANIFEST} must contain exactly ${String(EXPECTED_BINARY_ASSETS.length)} entries`,
    );
  }
  for (const name of EXPECTED_BINARY_ASSETS) {
    const expected = entries.get(name);
    if (expected === undefined) {
      throw new Error(`${CHECKSUM_MANIFEST} entry is missing: ${name}`);
    }
    const actual = sha256File(join(directory, name));
    if (actual !== expected) {
      throw new Error(`Release asset checksum mismatch: ${name}`);
    }
  }

  return { assetCount: actualFiles.length, binaryCount: EXPECTED_BINARY_ASSETS.length };
};

const main = (): void => {
  const command = process.argv[2];
  const directory = process.argv[3];
  if ((command !== "generate" && command !== "validate") || directory === undefined) {
    throw new Error("Usage: release-checksums.ts <generate|validate> <asset-directory>");
  }
  if (command === "generate") generateReleaseChecksums(directory);
  const result = validateReleaseAssets(directory);
  console.log(
    `Validated ${String(result.binaryCount)} binaries and ${CHECKSUM_MANIFEST} in ${directory}`,
  );
};

const entryPath = process.argv[1];
if (entryPath !== undefined && resolve(entryPath) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
