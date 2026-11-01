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

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { ReleaseValidationFailed } from "./release-process.js";

import { readWorkspacePackageDirectories } from "./workspace-packages.js";

export interface ProductionPackage {
  /** Published package name, for example `@agentxm/workspace-kernel/workspace-state`. */
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
const jsonObject = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown));

export const readProductionPackages = Effect.fnUntraced(function* (repoRoot: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directories = yield* readWorkspacePackageDirectories(repoRoot);
  const declared: ProductionPackage[] = [];
  for (const directory of directories) {
    const projectPath = path.join(repoRoot, directory, "project.json");
    const source = yield* fs.readFileString(projectPath).pipe(
      Effect.catchIf(
        (error) => error.reason._tag === "NotFound",
        () => Effect.succeed(undefined),
      ),
    );
    if (source === undefined) continue;
    const project = yield* Schema.decodeUnknownEffect(jsonObject)(source);
    const levels = stringEntries(project["tags"])
      .filter((tag) => tag.startsWith(LEVEL_TAG_PREFIX))
      .map((tag) => tag.slice(LEVEL_TAG_PREFIX.length))
      .filter((level) => !NON_PRODUCTION_LEVELS.has(level));
    if (levels.length === 0) continue;
    const manifestPath = path.join(repoRoot, directory, "package.json");
    const manifest = yield* Schema.decodeUnknownEffect(jsonObject)(
      yield* fs.readFileString(manifestPath),
    );
    const name = manifest["name"];
    if (typeof name !== "string")
      return yield* new ReleaseValidationFailed({
        operation: "Read production package",
        cause: `${manifestPath} must declare a package name`,
      });
    declared.push({ name, directory, levels, dependencies: declaredDependencyNames(manifest) });
  }
  const productionNames = new Set(declared.map((entry) => entry.name));
  return declared.map((entry) => ({
    ...entry,
    dependencies: entry.dependencies.filter((dependency) => productionNames.has(dependency)),
  }));
});
