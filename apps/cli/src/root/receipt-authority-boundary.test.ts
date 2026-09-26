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
  const productionFiles = [
    "packages/core/workspace-kernel/src/operations",
    "packages/core/workspace-kernel/src/planning",
    "packages/core/workspace-kernel/src/workspace-state",
    "apps/cli/src",
  ].flatMap((directory) => collectProductionFiles(path.join(repoRoot, directory)));

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
      "packages/core/workspace-kernel/src/settlement/transaction.ts",
      "packages/core/workspace-kernel/src/settlement/transition-lock.ts",
      "packages/generic/host-primitives/src/atomic-write.ts",
    ].map((source) => fs.readFileSync(path.join(repoRoot, source), "utf8"));
    const kernelPackages = [
      "packages/core/workspace-kernel/package.json",
      "packages/generic/host-primitives/package.json",
    ].map((manifest) => fs.readFileSync(path.join(repoRoot, manifest), "utf8"));

    for (const source of lockingSources) {
      expect(source).not.toContain("fs-native-extensions");
    }
    for (const manifest of kernelPackages) {
      expect(manifest).not.toContain("fs-native-extensions");
    }
  });

  it("keeps history, projection, authored, and pack-membership fields out of lock schema", () => {
    const source = fs.readFileSync(
      path.join(
        repoRoot,
        "packages/core/workspace-kernel/src/workspace-state/desired/lockfile/schema.ts",
      ),
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
