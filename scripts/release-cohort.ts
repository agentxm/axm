/**
 * Resolve the fixed AXM release cohort from its canonical declaration.
 *
 * `nx.json` selects the release group as `tag:release:cli`, so the tag each
 * project carries is the single source of truth for cohort membership. Every
 * descriptor is read from the same snapshot that declares that membership:
 * the working tree for validators that judge the current checkout, and a named
 * Git ref for validators that must judge a commit other than the one checked
 * out. Reading both from one snapshot is what keeps a ref validator from
 * silently applying today's cohort to an older commit.
 */

import { readFileSync } from "node:fs";
import * as Schema from "effect/Schema";

import { capture } from "./release-command.js";

export const RELEASE_COHORT_TAG = "release:cli";

const PROJECT_FILE = "project.json";
const MANIFEST_FILE = "package.json";

export type ReleasePackage = {
  readonly name: string;
  readonly path: string;
  readonly project: string;
  readonly tarballPrefix: string;
};

/** A repository snapshot that can list its project files and read their contents. */
export interface CohortSnapshot {
  /** Identifies the snapshot in diagnostics, e.g. `working tree` or a commit SHA. */
  readonly describe: string;
  readonly listProjectFiles: () => readonly string[];
  readonly read: (path: string) => string;
}

const isProjectFile = (path: string): boolean =>
  path === PROJECT_FILE || path.endsWith(`/${PROJECT_FILE}`);

/**
 * Tracked project files as they currently exist on disk, so an uncommitted tag
 * change is visible to the validators that inspect the working tree.
 */
export const workingTreeSnapshot = (): CohortSnapshot => ({
  describe: "working tree",
  listProjectFiles: () =>
    capture("git", ["ls-files", "--", `*${PROJECT_FILE}`])
      .split("\n")
      .filter(isProjectFile),
  read: (path) => readFileSync(path, "utf8"),
});

/** The cohort exactly as the named ref declares it, independent of the checkout. */
export const gitRefSnapshot = (ref: string): CohortSnapshot => ({
  describe: ref,
  listProjectFiles: () =>
    capture("git", ["ls-tree", "-r", "--name-only", ref]).split("\n").filter(isProjectFile),
  read: (path) => capture("git", ["show", `${ref}:${path}`]),
});

const projectDeclaration = Schema.Struct({
  name: Schema.optional(Schema.String),
  tags: Schema.optional(Schema.Array(Schema.String)),
});

const manifestDeclaration = Schema.Struct({
  name: Schema.String,
  dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});

const decodeProject = Schema.decodeUnknownSync(Schema.fromJsonString(projectDeclaration));
const decodeManifest = Schema.decodeUnknownSync(Schema.fromJsonString(manifestDeclaration));

/**
 * `npm pack` names a tarball after the package name with the scope separator
 * flattened, so `@agentxm/registry-client` packs as
 * `agentxm-registry-client-{version}.tgz` and `axm.sh` as `axm.sh-{version}.tgz`.
 */
const tarballPrefixFor = (name: string): string =>
  `${name.replace(/^@/u, "").replace(/\//gu, "-")}-`;

const orderDependenciesFirst = (
  members: readonly ReleasePackage[],
  dependencies: ReadonlyMap<string, readonly string[]>,
  source: string,
): readonly ReleasePackage[] => {
  const byName = new Map(members.map((member) => [member.name, member]));
  const ordered: ReleasePackage[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (name: string, trail: readonly string[]) => {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      throw new Error(
        `Cyclic release cohort dependency in ${source}: ${[...trail, name].join(" -> ")}.`,
      );
    }

    visiting.add(name);
    for (const dependency of [...(dependencies.get(name) ?? [])].sort()) {
      if (dependency !== name && byName.has(dependency)) visit(dependency, [...trail, name]);
    }
    visiting.delete(name);
    visited.add(name);

    const member = byName.get(name);
    if (member !== undefined) ordered.push(member);
  };

  // Sorted entry and traversal keep the order stable for a given snapshot.
  for (const name of [...byName.keys()].sort()) visit(name, []);
  return ordered;
};

/**
 * Every `release:cli` project in the snapshot, ordered so that each cohort
 * member follows the cohort members it depends on. Local preview publishing
 * relies on that order to make an internal dependency installable before its
 * consumers are published.
 */
export const resolveReleaseCohort = (snapshot: CohortSnapshot): readonly ReleasePackage[] => {
  const members: ReleasePackage[] = [];
  const dependencies = new Map<string, readonly string[]>();

  for (const projectFile of snapshot.listProjectFiles()) {
    const source = `${snapshot.describe}:${projectFile}`;
    const project = decodeProject(snapshot.read(projectFile));
    if (!(project.tags ?? []).includes(RELEASE_COHORT_TAG)) continue;

    const root = projectFile.slice(0, -(PROJECT_FILE.length + 1));
    const path = root === "" ? MANIFEST_FILE : `${root}/${MANIFEST_FILE}`;
    const manifest = decodeManifest(snapshot.read(path));

    if (dependencies.has(manifest.name)) {
      throw new Error(`Duplicate release cohort package ${manifest.name} in ${source}.`);
    }

    members.push({
      name: manifest.name,
      path,
      project: project.name ?? root.slice(root.lastIndexOf("/") + 1),
      tarballPrefix: tarballPrefixFor(manifest.name),
    });
    dependencies.set(manifest.name, Object.keys(manifest.dependencies ?? {}));
  }

  if (members.length === 0) {
    throw new Error(`No ${RELEASE_COHORT_TAG} projects declared in ${snapshot.describe}.`);
  }

  return orderDependenciesFirst(members, dependencies, snapshot.describe);
};
