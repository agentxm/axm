/** Workspace package directories, enumerated from the pnpm workspace globs. */

import * as fs from "node:fs";
import * as path from "node:path";

import { parse } from "yaml";

const expandPattern = (base: string, segments: ReadonlyArray<string>): ReadonlyArray<string> => {
  const [head, ...rest] = segments;
  if (head === undefined) return [base];
  if (head === "*") {
    if (!fs.existsSync(base)) return [];
    return fs
      .readdirSync(base, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith("."),
      )
      .flatMap((entry) => expandPattern(path.join(base, entry.name), rest));
  }
  if (head.includes("*")) {
    throw new Error(`Unsupported pnpm workspace glob segment: ${head}`);
  }
  return expandPattern(path.join(base, head), rest);
};

/**
 * Repository-relative directories of every workspace package the pnpm
 * workspace declares, in sorted order. A directory is a package only when it
 * holds a `package.json`, exactly as pnpm resolves the workspace.
 */
export const readWorkspacePackageDirectories = (repoRoot: string): ReadonlyArray<string> => {
  const parsed: unknown = parse(
    fs.readFileSync(path.join(repoRoot, "pnpm-workspace.yaml"), "utf8"),
  );
  const patterns =
    typeof parsed === "object" && parsed !== null && "packages" in parsed
      ? parsed.packages
      : undefined;
  if (!Array.isArray(patterns) || patterns.length === 0) {
    throw new Error("pnpm-workspace.yaml must declare workspace package globs");
  }
  return patterns
    .filter((pattern): pattern is string => typeof pattern === "string")
    .flatMap((pattern) => expandPattern(repoRoot, pattern.split("/")))
    .filter((directory) => fs.existsSync(path.join(directory, "package.json")))
    .map((directory) => path.relative(repoRoot, directory).split(path.sep).join("/"))
    .sort();
};
