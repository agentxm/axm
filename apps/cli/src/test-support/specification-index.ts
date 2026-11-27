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

const repositoryRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);
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

const SUPERSEDES_LIST = /supersedes:\s*\[([^\]]*)\]/u;
const STRING_LITERAL = /"([^"]+)"/gu;

interface SpecificationIndex {
  /** Requirement identity to the absolute path of the file that declares it. */
  readonly files: ReadonlyMap<string, string>;
  /** Retired identity to the successor whose `supersedes` names it. */
  readonly successors: ReadonlyMap<string, string>;
}

const buildIndex = (): SpecificationIndex => {
  const paths: Array<string> = [];
  for (const root of SEARCH_ROOTS) specificationFiles(path.join(repositoryRoot, root), paths);
  const files = new Map<string, string>();
  const successors = new Map<string, string>();
  for (const file of paths.sort()) {
    const content = fs.readFileSync(file, "utf8");
    if (!content.includes("defineSpecification(")) continue;
    const identity = REQUIREMENT_LITERAL.exec(content)?.[1];
    if (identity === undefined || files.has(identity)) continue;
    files.set(identity, file);
    const supersedes = SUPERSEDES_LIST.exec(content)?.[1] ?? "";
    for (const [, predecessor] of supersedes.matchAll(STRING_LITERAL)) {
      if (predecessor !== undefined) successors.set(predecessor, identity);
    }
  }
  return { files, successors };
};

let cached: SpecificationIndex | undefined;

const specificationIndex = (): SpecificationIndex => (cached ??= buildIndex());

/** The file declaring `identity`, or `undefined` when nothing declares it. */
export const specificationFileFor = (identity: string): string | undefined =>
  specificationIndex().files.get(identity);

/** One requirement identity and the file that declares it. */
export interface SpecificationOwner {
  readonly identity: string;
  readonly file: string;
}

/**
 * Who stands for `identity` today: the specification that declares it, or —
 * once it is retired as superseded — the successor whose `supersedes` names
 * it. An obligation a consolidation absorbed is still owned, by the file that
 * absorbed it.
 */
export const owningSpecification = (identity: string): SpecificationOwner | undefined => {
  const { successors } = specificationIndex();
  const visited = new Set<string>();
  let current = identity;
  while (!visited.has(current)) {
    visited.add(current);
    const file = specificationFileFor(current);
    if (file !== undefined) return { identity: current, file };
    const successor = successors.get(current);
    if (successor === undefined) return undefined;
    current = successor;
  }
  return undefined;
};
