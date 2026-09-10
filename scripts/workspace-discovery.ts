/**
 * One inferred source of project metadata for every repository check that
 * asks "which projects exist, which project owns this file, and where does
 * that project keep its source": specification discovery, the catalog, the
 * verdict, execution-evidence fingerprints, selection, and source hygiene.
 *
 * The live workspace is the Nx project graph plus its project file map, so a
 * project exists because its `project.json` exists and a file belongs to the
 * nearest project root above it — the same answer Nx gives lint and caching.
 * A Git ref is read the same way from `git ls-tree`, so both sides of a
 * verdict resolve ownership identically regardless of layout. Nothing here is
 * a hand-maintained inventory of packages, areas, or directories.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  createProjectFileMapUsingProjectGraph,
  createProjectGraphAsync,
  getOutputsForTargetAndConfiguration,
  readCachedProjectGraph,
  workspaceRoot as nxWorkspaceRoot,
  type ProjectGraph,
  type TargetConfiguration,
} from "@nx/devkit";

import { inferDomainTag } from "./placement-tags-plugin.js";
import {
  digestSpecificationSource,
  parseExecutionBindingFile,
  parseSpecificationFile,
  type CatalogExecutionBinding,
  type CatalogIssue,
  type SpecificationSource,
} from "./specification-catalog-lib.js";

export interface WorkspaceProject {
  readonly name: string;
  /** Repository-relative root with forward slashes; `""` for the workspace-root project. */
  readonly root: string;
  /** Repository-relative source root; defaults to `<root>/src`. */
  readonly sourceRoot: string;
  readonly tags: readonly string[];
  readonly targets: Readonly<Record<string, TargetConfiguration>>;
}

export interface Workspace {
  /** Identifies the snapshot in diagnostics: `working tree` or a Git ref. */
  readonly describe: string;
  /** Absolute repository root the snapshot was taken from. */
  readonly root: string;
  readonly projects: readonly WorkspaceProject[];
  /** The nearest project whose root contains the file, if any. */
  readonly ownerOf: (filePath: string) => WorkspaceProject | undefined;
  /** Every file the project owns, repository-relative and sorted. */
  readonly filesOf: (project: string | WorkspaceProject) => readonly string[];
  /** Reads one repository-relative file from the snapshot. */
  readonly read: (filePath: string) => string;
}

export interface WorkspaceSeed {
  readonly describe: string;
  readonly root: string;
  readonly projects: readonly WorkspaceProject[];
  readonly files: readonly string[];
  readonly read: (filePath: string) => string;
}

const PROJECT_FILE = "project.json";

const normalize = (filePath: string): string => filePath.replaceAll("\\", "/");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isUnder = (filePath: string, directory: string): boolean =>
  directory === "" || filePath === directory || filePath.startsWith(`${directory}/`);

/** The `domain:*` tag placement implies, or none when the root is not a classified placement. */
const placementDomain = (root: string): string | undefined => {
  try {
    return inferDomainTag(root);
  } catch {
    return undefined;
  }
};

const projectFromDeclaration = (projectFile: string, declaration: string): WorkspaceProject => {
  const parsed: unknown = JSON.parse(declaration);
  const record = isRecord(parsed) ? parsed : {};
  const root = projectFile === PROJECT_FILE ? "" : projectFile.slice(0, -(PROJECT_FILE.length + 1));
  const name = record["name"];
  const sourceRoot = record["sourceRoot"];
  const authoredTags = Array.isArray(record["tags"])
    ? record["tags"].filter((tag): tag is string => typeof tag === "string")
    : [];
  const inferred = placementDomain(root);
  const targets = isRecord(record["targets"]) ? record["targets"] : {};
  return {
    name: typeof name === "string" ? name : root.slice(root.lastIndexOf("/") + 1),
    root,
    sourceRoot:
      typeof sourceRoot === "string" ? normalize(sourceRoot) : root === "" ? "src" : `${root}/src`,
    tags: inferred === undefined ? authoredTags : [...authoredTags, inferred],
    targets: Object.fromEntries(
      Object.entries(targets).filter((entry): entry is [string, TargetConfiguration] =>
        isRecord(entry[1]),
      ),
    ),
  };
};

/** Builds a workspace from explicit projects and files; ownership is the nearest project root. */
export const makeWorkspace = (seed: WorkspaceSeed): Workspace => {
  const projects = [...seed.projects].sort((left, right) => left.root.localeCompare(right.root));
  const byName = new Map(projects.map((project) => [project.name, project]));
  const ownerOf = (filePath: string): WorkspaceProject | undefined => {
    const normalized = normalize(filePath);
    let owner: WorkspaceProject | undefined;
    for (const project of projects) {
      if (
        isUnder(normalized, project.root) &&
        (owner === undefined || project.root.length > owner.root.length)
      ) {
        owner = project;
      }
    }
    return owner;
  };
  const filesByOwner = new Map<string, string[]>();
  for (const file of [...new Set(seed.files.map(normalize))].sort()) {
    const owner = ownerOf(file);
    if (owner === undefined) continue;
    const files = filesByOwner.get(owner.name) ?? [];
    files.push(file);
    filesByOwner.set(owner.name, files);
  }
  return {
    describe: seed.describe,
    root: seed.root,
    projects,
    ownerOf,
    filesOf: (project) => {
      const name = typeof project === "string" ? project : project.name;
      if (!byName.has(name)) throw new Error(`Unknown project ${name} in ${seed.describe}.`);
      return filesByOwner.get(name) ?? [];
    },
    read: seed.read,
  };
};

const workspaceFromGraph = async (graph: ProjectGraph, root: string): Promise<Workspace> => {
  const fileMap = await createProjectFileMapUsingProjectGraph(graph);
  const projects = Object.values(graph.nodes).map((node): WorkspaceProject => ({
    name: node.name,
    root: normalize(node.data.root),
    sourceRoot:
      node.data.sourceRoot === undefined
        ? node.data.root === "."
          ? "src"
          : `${normalize(node.data.root)}/src`
        : normalize(node.data.sourceRoot),
    tags: node.data.tags ?? [],
    targets: node.data.targets ?? {},
  }));
  return makeWorkspace({
    describe: "working tree",
    root,
    projects: projects.map((project) =>
      project.root === "." ? { ...project, root: "" } : project,
    ),
    files: Object.values(fileMap).flatMap((files) => files.map((file) => file.file)),
    read: (filePath) => fs.readFileSync(path.join(root, filePath), "utf8"),
  });
};

let liveWorkspace: Promise<Workspace> | undefined;

/**
 * The working tree as the Nx project graph sees it, memoized per process.
 * Scripts use this; it may consult the Nx daemon.
 */
export const readWorkspace = (): Promise<Workspace> => {
  liveWorkspace ??= createProjectGraphAsync({ exitOnError: false }).then((graph) =>
    workspaceFromGraph(graph, nxWorkspaceRoot),
  );
  return liveWorkspace;
};

/**
 * The working tree from the cached project graph, for in-process hosts such
 * as Vitest reporters that must not start graph construction. Inside
 * `nx run` the cache is current.
 */
export const readCachedWorkspace = (): Promise<Workspace> =>
  workspaceFromGraph(readCachedProjectGraph(), nxWorkspaceRoot);

const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(["node_modules", "dist", "out-tsc"]);

const walk = (root: string, directory: string, results: string[]): void => {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const relative = directory === "" ? entry.name : `${directory}/${entry.name}`;
    if (entry.isDirectory()) walk(root, relative, results);
    else results.push(relative);
  }
};

/**
 * A directory tree read directly from disk, for fixtures that are not Nx
 * workspaces. Tags carry the authored `project.json` tags plus the domain
 * placement implies; no plugin runs.
 */
export const workspaceFromProjectFiles = (root: string): Workspace => {
  const files: string[] = [];
  walk(root, "", files);
  const read = (filePath: string): string => fs.readFileSync(path.join(root, filePath), "utf8");
  return makeWorkspace({
    describe: root,
    root,
    projects: files
      .filter((file) => file === PROJECT_FILE || file.endsWith(`/${PROJECT_FILE}`))
      .map((file) => projectFromDeclaration(file, read(file))),
    files,
    read,
  });
};

/**
 * A committed snapshot: the tracked tree at `ref`, with each file owned by
 * the nearest `project.json` in that same tree. This is how the verdict
 * reads its base side, so a specification keeps its identity across a move
 * or a layout change.
 */
export const gitRefWorkspace = (ref: string, repoRoot: string = nxWorkspaceRoot): Workspace => {
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const files = git("ls-tree", "-r", "--name-only", ref).split("\n").filter(Boolean);
  const read = (filePath: string): string => git("show", `${ref}:${filePath}`);
  return makeWorkspace({
    describe: ref,
    root: repoRoot,
    projects: files
      .filter((file) => file === PROJECT_FILE || file.endsWith(`/${PROJECT_FILE}`))
      .map((file) => projectFromDeclaration(file, read(file))),
    files,
    read,
  });
};

const hasTag = (project: WorkspaceProject, tag: string): boolean => project.tags.includes(tag);
const hasDomain = (project: WorkspaceProject): boolean =>
  project.tags.some((tag) => tag.startsWith("domain:"));

/**
 * Projects that ship runtime code: every domain-classified library and the
 * application. End-to-end and tooling projects observe shipped artifacts and
 * own no production source.
 */
export const productionProjects = (workspace: Workspace): readonly WorkspaceProject[] =>
  workspace.projects.filter((project) => hasDomain(project) || hasTag(project, "role:application"));

/** Projects that bind boundary executions to requirement identities. */
export const discoverExecutionBindingProjects = (
  workspace: Workspace,
): readonly WorkspaceProject[] =>
  workspace.projects.filter((project) => hasTag(project, "role:e2e"));

/**
 * Whether a project may own specification files. Production projects own
 * the requirements their source realizes; an end-to-end project owns the
 * boundary specifications bound beside its executions; the central catalog
 * project (tagged `type:specification`) is sanctioned while it retires.
 * Other tooling projects verify the product and do not state requirements.
 */
export const isSanctionedSpecificationOwner = (project: WorkspaceProject): boolean =>
  hasDomain(project) ||
  hasTag(project, "role:application") ||
  hasTag(project, "role:e2e") ||
  hasTag(project, "type:specification");

const isFixturePath = (filePath: string): boolean => filePath.split("/").includes("__fixtures__");

export const isSpecificationPath = (filePath: string): boolean =>
  filePath.endsWith(".spec.ts") && !isFixturePath(filePath);

/** Whether a specification sits where its owner keeps authored source. */
export const isAuthoredSpecificationPlacement = (
  project: WorkspaceProject,
  filePath: string,
): boolean =>
  isUnder(filePath, project.sourceRoot) ||
  isUnder(filePath, project.root === "" ? "specifications" : `${project.root}/specifications`);

export interface SpecificationDiscovery {
  readonly specifications: readonly SpecificationSource[];
  readonly issues: readonly CatalogIssue[];
}

/**
 * Every tracked `*.spec.ts` in every project, parsed statically. Rejected
 * with an issue: a file no project owns, an owner that may not state
 * requirements, a file outside its owner's authored source, and a second
 * file for an identity already discovered (the first, in path order, stays).
 */
export const discoverSpecifications = (workspace: Workspace): SpecificationDiscovery => {
  const issues: CatalogIssue[] = [];
  const specifications: SpecificationSource[] = [];
  const seen = new Map<string, string>();
  const candidates = workspace.projects
    .flatMap((project) =>
      workspace
        .filesOf(project)
        .filter(isSpecificationPath)
        .map((file) => ({ project, file })),
    )
    .sort((left, right) => left.file.localeCompare(right.file));
  for (const { project, file } of candidates) {
    if (!isSanctionedSpecificationOwner(project)) {
      issues.push({
        severity: "error",
        source: file,
        message: `owner project \`${project.name}\` (${project.tags.filter((tag) => tag.startsWith("role:")).join(", ") || "no role"}) may not own specifications; only production, application, and end-to-end projects state requirements`,
      });
      continue;
    }
    if (!isAuthoredSpecificationPlacement(project, file)) {
      issues.push({
        severity: "error",
        source: file,
        message: `specification lives outside its owner's authored source (\`${project.sourceRoot}/\` or \`${project.root === "" ? "" : `${project.root}/`}specifications/\`)`,
      });
      continue;
    }
    const content = workspace.read(file);
    const parsed = parseSpecificationFile(content, file);
    issues.push(...parsed.issues);
    if (parsed.specification === undefined) continue;
    const identity = parsed.specification.metadata.requirement;
    const first = seen.get(identity);
    if (first !== undefined) {
      issues.push({
        severity: "error",
        source: file,
        message: `duplicate requirement identity \`${identity}\` (also declared in ${first}); exactly one canonical specification file per identity`,
      });
      continue;
    }
    seen.set(identity, file);
    specifications.push(
      digestSpecificationSource({ ...parsed.specification, owner: project.name }, content),
    );
  }
  return { specifications, issues };
};

export interface ExecutionBindingDiscovery {
  readonly bindings: readonly CatalogExecutionBinding[];
  readonly issues: readonly CatalogIssue[];
}

/** Every execution binding declared in an end-to-end project's TypeScript files. */
export const discoverExecutionBindings = (workspace: Workspace): ExecutionBindingDiscovery => {
  const issues: CatalogIssue[] = [];
  const bindings: CatalogExecutionBinding[] = [];
  for (const project of discoverExecutionBindingProjects(workspace)) {
    for (const file of workspace.filesOf(project)) {
      if (!file.endsWith(".ts") || isFixturePath(file)) continue;
      const parsed = parseExecutionBindingFile(workspace.read(file), file);
      issues.push(...parsed.issues);
      if (parsed.binding !== undefined) bindings.push(parsed.binding);
    }
  }
  return { bindings, issues };
};

const isRuntimeTarget = (name: string): boolean => name === "build" || name.startsWith("compile");

/**
 * Repository-relative directories that hold built runtime artifacts, resolved
 * from every project's `build` and `compile*` outputs exactly as Nx resolves
 * them. Execution evidence fingerprints these instead of guessing a `dist`
 * beside each manifest.
 */
export const runtimeOutputs = (workspace: Workspace): readonly string[] => {
  const outputs = new Set<string>();
  for (const project of workspace.projects) {
    for (const [targetName, target] of Object.entries(project.targets)) {
      if (!isRuntimeTarget(targetName) || (target.outputs ?? []).length === 0) continue;
      const resolved = getOutputsForTargetAndConfiguration(
        { project: project.name, target: targetName },
        {},
        {
          name: project.name,
          type: "lib",
          data: { root: project.root === "" ? "." : project.root, targets: project.targets },
        },
      );
      for (const output of resolved) {
        const normalized = normalize(output).replace(/^\.\//u, "").replace(/\/+$/u, "");
        if (normalized.length > 0 && !/[{}*]/u.test(normalized)) outputs.add(normalized);
      }
    }
  }
  return [...outputs].sort();
};
