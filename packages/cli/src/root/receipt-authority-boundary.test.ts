import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const rootDir = path.join(repoRoot, "packages/cli/src/root");

const extensionFamilyDirs = [
  "commands",
  "files",
  "hooks",
  "knowledge",
  "mcps",
  "packs",
  "rules",
  "skills",
  "subagents",
] as const;

const coreAuthorityDirs = [
  "commands",
  "extensions",
  "files",
  "hooks",
  "knowledge",
  "mcps",
  "packs",
  "rules",
  "skills",
  "source-resolution",
  "subagents",
] as const;

/**
 * Receipt reads are allowed only in these named presentation/history surfaces
 * and best-effort artifact enrichers. Desired state, observed materialization,
 * and trust must remain the only mutation authorities.
 *
 * Exact equality is intentional: a new receipt consumer fails this test, and a
 * removed consumer leaves a stale exemption that also fails.
 */
const allowedReceiptReaders = [
  // Read-only presentation and maintenance.
  "packages/cli/src/root/commands/list.ts",
  "packages/cli/src/root/files/list.ts",
  "packages/cli/src/root/hooks/list.ts",
  "packages/cli/src/root/knowledge/inspect.ts",
  "packages/cli/src/root/mcps/list.ts",
  "packages/cli/src/root/packs/list.ts",
  "packages/cli/src/root/packs/show.ts",
  "packages/cli/src/root/rules/list.ts",
  "packages/cli/src/root/skills/list.ts",

  // Best-effort history/artifact enrichment on mutation paths.
  "packages/cli/src/root/commands/install/command-actions.ts",
  "packages/cli/src/root/commands/new.ts",
  "packages/cli/src/root/commands/uninstall/command-actions.ts",
  "packages/cli/src/root/files/disable.ts",
  "packages/cli/src/root/files/enable.ts",
  "packages/cli/src/root/files/install/command-actions.ts",
  "packages/cli/src/root/files/new.ts",
  "packages/cli/src/root/files/uninstall/command-actions.ts",
  "packages/cli/src/root/hooks/disable.ts",
  "packages/cli/src/root/hooks/enable.ts",
  "packages/cli/src/root/hooks/install/command-actions.ts",
  "packages/cli/src/root/hooks/new.ts",
  "packages/cli/src/root/hooks/uninstall/command-actions.ts",
  "packages/cli/src/root/mcps/uninstall/command-actions.ts",
  "packages/cli/src/root/packs/activation.ts",
  "packages/cli/src/root/skills/install/command-actions.ts",
  "packages/cli/src/root/skills/uninstall/command-actions.ts",
  "packages/cli/src/root/skills/update/handler.ts",
  "packages/cli/src/root/subagents/install/command-actions.ts",
  "packages/cli/src/root/subagents/uninstall/command-actions.ts",
] as const;

const mutationReceiptReaders: ReadonlySet<string> = new Set(
  allowedReceiptReaders.filter(
    (file) =>
      !file.endsWith("/list.ts") &&
      !file.endsWith("/show.ts") &&
      !file.endsWith("/prune.ts") &&
      !file.endsWith("/inspect.ts"),
  ),
);

const collectProductionFiles = (directory: string): ReadonlyArray<string> =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectProductionFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [fullPath]
      : [];
  });

const receiptReadPattern = /\.getLocked[A-Za-z]*\(/g;

const relative = (file: string): string => path.relative(repoRoot, file);

describe("receipt authority boundary", () => {
  const sourceFiles = extensionFamilyDirs.flatMap((family) =>
    collectProductionFiles(path.join(rootDir, family)),
  );

  it("keeps every receipt reader on the exact presentation/history allowlist", () => {
    const readers = sourceFiles
      .filter((file) => fs.readFileSync(file, "utf-8").match(receiptReadPattern) !== null)
      .map(relative)
      .sort();

    expect(readers).toStrictEqual([...allowedReceiptReaders].sort());
  });

  it("makes receipt reads on mutation paths best-effort", () => {
    const unsafeReads = sourceFiles.flatMap((file) => {
      const fileName = relative(file);
      if (!mutationReceiptReaders.has(fileName)) {
        return [];
      }

      const source = fs.readFileSync(file, "utf-8");
      return Array.from(source.matchAll(receiptReadPattern)).flatMap((match) => {
        const suffix = source.slice(match.index, match.index + 220);
        return /\.pipe\(\s*Effect\.catch\(/.test(suffix) ? [] : [fileName];
      });
    });

    expect(unsafeReads).toStrictEqual([]);
  });

  it("keeps Core lifecycle and source-resolution code receipt-free", () => {
    const readers = coreAuthorityDirs
      .flatMap((directory) =>
        collectProductionFiles(path.join(repoRoot, "packages/core/src/unstable", directory)),
      )
      .filter((file) => fs.readFileSync(file, "utf-8").match(receiptReadPattern) !== null)
      .map(relative)
      .sort();

    expect(readers).toStrictEqual([]);
  });
});
