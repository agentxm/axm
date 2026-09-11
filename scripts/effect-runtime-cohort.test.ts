import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import YAML from "yaml";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readObject = (path: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(value)) throw new Error(`${path} must contain a JSON object.`);
  return value;
};

describe("published Effect runtime cohort", () => {
  it("pins the CLI's Node runtime packages to the same Effect prerelease", () => {
    const workspace: unknown = YAML.parse(
      readFileSync(resolve(repoRoot, "pnpm-workspace.yaml"), "utf8"),
    );
    if (!isRecord(workspace) || !isRecord(workspace["catalog"])) {
      throw new Error("pnpm-workspace.yaml must declare a catalog.");
    }
    const catalog = workspace["catalog"];
    const effectVersion = catalog["effect"];

    expect(effectVersion).toMatch(/^4\.0\.0-rc\.\d+$/u);
    expect(catalog["@effect/platform-node"]).toBe(effectVersion);
    expect(catalog["@effect/platform-node-shared"]).toBe(effectVersion);

    const cliManifest = readObject(resolve(repoRoot, "apps/cli/package.json"));
    const dependencies = cliManifest["dependencies"];
    if (!isRecord(dependencies)) throw new Error("The CLI must declare runtime dependencies.");

    // platform-node permits newer prereleases of platform-node-shared. Keeping
    // the shared package direct makes clean consumer installs use this cohort.
    expect(dependencies["@effect/platform-node"]).toBe("catalog:");
    expect(dependencies["@effect/platform-node-shared"]).toBe("catalog:");
    expect(dependencies["effect"]).toBe("catalog:");
  });
});
