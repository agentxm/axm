/**
 * Where each requirement identity's canonical specification file lives.
 *
 * A specification is authored beside the source it binds: repository-wide
 * obligations under `specifications/`, and the obligations a package owns
 * under that package's own `src/`. An identity is therefore resolved by
 * reading what each file declares, not by assuming a path.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SEARCH_ROOTS = ["specifications", "apps", "packages", "tools"] as const;
const IGNORED_DIRECTORIES = new Set(["node_modules", "dist", "out-tsc", "__fixtures__", ".axm"]);
const REQUIREMENT_LITERAL = /requirement:\s*"([^"]+)"/u;

const specificationFiles = (directory: string, found: Array<string>): void => {
  const entries = fs.existsSync(directory)
    ? fs.readdirSync(directory, { withFileTypes: true })
    : [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      specificationFiles(entryPath, found);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".spec.ts")) found.push(entryPath);
  }
};

const buildIndex = (): ReadonlyMap<string, string> => {
  const files: Array<string> = [];
  for (const root of SEARCH_ROOTS) specificationFiles(path.join(repositoryRoot, root), files);
  const index = new Map<string, string>();
  for (const file of files.sort()) {
    const content = fs.readFileSync(file, "utf8");
    if (!content.includes("defineSpecification(")) continue;
    const identity = REQUIREMENT_LITERAL.exec(content)?.[1];
    if (identity === undefined || index.has(identity)) continue;
    index.set(identity, file);
  }
  return index;
};

let cached: ReadonlyMap<string, string> | undefined;

/** Requirement identity to the absolute path of the file that declares it. */
export const specificationIndex = (): ReadonlyMap<string, string> => (cached ??= buildIndex());

/** The file declaring `identity`, or `undefined` when nothing declares it. */
export const specificationFileFor = (identity: string): string | undefined =>
  specificationIndex().get(identity);
