/**
 * Production package inventory for the architecture specifications.
 *
 * Reads what the repository declares on disk about its production packages:
 * each package's published name, the dependency level its project declares,
 * and the production packages its manifest declares a dependency on. A
 * production package is a workspace package whose project declares a runtime
 * `role:*` tag; end-to-end and engineering-support projects carry
 * `role:e2e` or `role:tooling` and are not part of the production dependency
 * structure.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { readWorkspacePackageDirectories } from "./workspace-packages.js";

export interface ProductionPackage {
  /** Published package name, for example `@agentxm/workspace-state`. */
  readonly name: string;
  /** Repository-relative package directory. */
  readonly directory: string;
  /** Dependency levels the project declares through its `role:*` tags. */
  readonly levels: ReadonlyArray<string>;
  /** Names of the production packages this package's manifest depends on. */
  readonly dependencies: ReadonlyArray<string>;
}

const PRODUCTION_DEPENDENCY_FIELDS = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

const LEVEL_TAG_PREFIX = "role:";
const NON_PRODUCTION_LEVELS: ReadonlySet<string> = new Set(["e2e", "tooling"]);

const readJsonObject = (filePath: string): Partial<Record<string, unknown>> => {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${filePath} must be a JSON object`);
  }
  return { ...parsed };
};

const stringEntries = (value: unknown): ReadonlyArray<string> =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

const declaredDependencyNames = (
  manifest: Partial<Record<string, unknown>>,
): ReadonlyArray<string> =>
  PRODUCTION_DEPENDENCY_FIELDS.flatMap((field) => {
    const dependencies = manifest[field];
    return typeof dependencies === "object" && dependencies !== null
      ? Object.keys(dependencies)
      : [];
  });

/**
 * Lists every production package with the dependencies it declares on other
 * production packages, in directory order.
 */
export const readProductionPackages = (repoRoot: string): ReadonlyArray<ProductionPackage> => {
  const declared = readWorkspacePackageDirectories(repoRoot).flatMap(
    (directory): ProductionPackage[] => {
      const projectPath = path.join(repoRoot, directory, "project.json");
      const manifestPath = path.join(repoRoot, directory, "package.json");
      if (!fs.existsSync(projectPath)) {
        return [];
      }
      const levels = stringEntries(readJsonObject(projectPath)["tags"])
        .filter((tag) => tag.startsWith(LEVEL_TAG_PREFIX))
        .map((tag) => tag.slice(LEVEL_TAG_PREFIX.length))
        .filter((level) => !NON_PRODUCTION_LEVELS.has(level));
      if (levels.length === 0) {
        return [];
      }
      const manifest = readJsonObject(manifestPath);
      const name = manifest["name"];
      if (typeof name !== "string") {
        throw new Error(`${manifestPath} must declare a package name`);
      }
      return [{ name, directory, levels, dependencies: declaredDependencyNames(manifest) }];
    },
  );
  const productionNames = new Set(declared.map((entry) => entry.name));
  return declared.map((entry) => ({
    ...entry,
    dependencies: entry.dependencies.filter((dependency) => productionNames.has(dependency)),
  }));
};
