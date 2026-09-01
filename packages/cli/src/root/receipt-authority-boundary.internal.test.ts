import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const collectProductionFiles = (directory: string): ReadonlyArray<string> =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectProductionFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [fullPath]
      : [];
  });

describe("accepted-resolution authority boundary", () => {
  const productionFiles = ["packages/extension-management/src", "packages/cli/src"].flatMap(
    (directory) => collectProductionFiles(path.join(repoRoot, directory)),
  );

  it("has no trust repository production dependency", () => {
    const offenders = productionFiles
      .filter((file) => {
        const source = fs.readFileSync(file, "utf8");
        return source.includes("unstable/trust");
      })
      .map((file) => path.relative(repoRoot, file));

    expect(offenders).toEqual([]);
  });

  it("keeps workspace locking compatible with the Bun-distributed CLI", () => {
    const lockingSources = [
      "packages/extension-management/src/unstable/workspace/transaction.ts",
      "packages/extension-management/src/unstable/workspace/operations/transaction.ts",
      "packages/extension-management/src/unstable/workspace/operations/transition-lock.ts",
    ].map((source) => fs.readFileSync(path.join(repoRoot, source), "utf8"));
    const corePackage = fs.readFileSync(
      path.join(repoRoot, "packages/extension-management/package.json"),
      "utf8",
    );

    for (const source of lockingSources) {
      expect(source).not.toContain("fs-native-extensions");
    }
    expect(corePackage).not.toContain("fs-native-extensions");
  });

  it("keeps history, projection, authored, and pack-membership fields out of lock schema", () => {
    const source = fs.readFileSync(
      path.join(repoRoot, "packages/extension-management/src/unstable/lockfile/schema.ts"),
      "utf8",
    );
    for (const forbidden of [
      "installedAt",
      "updatedAt",
      "resolvedSkills",
      "resolvedMcpServers",
      "resolvedSubagents",
      'Schema.Literal("workspace")',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
