import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createProjectGraphAsync,
  getOutputsForTargetAndConfiguration,
  workspaceRoot as nxWorkspaceRoot,
  type ProjectGraphProjectNode,
  type TargetConfiguration,
} from "@nx/devkit";

const GENERATE_TARGET = "generate";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const runText = (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): string => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      [`Command failed (${command} ${args.join(" ")}).`, result.stdout.trim(), result.stderr.trim()]
        .filter((line) => line.length > 0)
        .join("\n"),
    );
  }
  return result.stdout;
};

const runInherited = (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): void => {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${command} ${args.join(" ")}) with exit ${result.status ?? 1}.`,
    );
  }
};

/**
 * Nx interpolates all of a target's declared outputs together, drops any template whose
 * workspace, project, or option tokens do not resolve, and leaves any other unknown token
 * in place. Ownership is resolved one template at a time, and a template that does not
 * fully resolve fails the guard instead of narrowing its scope.
 */
const resolveGeneratedOutput = (
  project: ProjectGraphProjectNode,
  targetName: string,
  target: TargetConfiguration,
  output: string,
): string => {
  const [resolved] = getOutputsForTargetAndConfiguration(
    { project: project.name, target: targetName },
    {},
    {
      ...project,
      data: {
        ...project.data,
        targets: { ...project.data.targets, [targetName]: { ...target, outputs: [output] } },
      },
    },
  );
  if (resolved === undefined || /[{}]/u.test(resolved)) {
    throw new Error(
      `Generated output ${output} in ${project.name}:${targetName} has tokens that do not resolve.`,
    );
  }
  const normalized = resolved.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
  if (normalized.length === 0 || normalized === "." || normalized.startsWith("../")) {
    throw new Error(`Generated output ${output} resolves outside the workspace.`);
  }
  return normalized;
};

export const collectGeneratedOutputs = (
  project: ProjectGraphProjectNode,
  entryTarget = GENERATE_TARGET,
): ReadonlyArray<string> => {
  const visited = new Set<string>();
  const outputs = new Set<string>();

  const visit = (targetName: string): void => {
    if (visited.has(targetName)) return;
    visited.add(targetName);
    const target = project.data.targets?.[targetName];
    if (!target) throw new Error(`Nx project ${project.name} has no ${targetName} target.`);

    // Only explicitly declared outputs are owned. When `outputs` is absent Nx falls back to
    // `options.outputPath` and to conventional build directories, which would widen the
    // guard's Git scope beyond what these targets actually generate.
    for (const output of target.outputs ?? []) {
      outputs.add(resolveGeneratedOutput(project, targetName, target, output));
    }
    for (const dependency of target.dependsOn ?? []) {
      if (typeof dependency === "string" && !dependency.startsWith("^")) visit(dependency);
    }
  };

  visit(entryTarget);
  return [...outputs].sort();
};

export const findGeneratedOutputDrift = (
  workspaceRoot: string,
  outputs: ReadonlyArray<string>,
): string =>
  runText(
    "git",
    ["status", "--short", "--untracked-files=all", "--", ...outputs],
    workspaceRoot,
    gitEnvironment(),
  ).trim();

const gitEnvironment = (): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));

export const mirrorNodeModules = (source: string, destination: string, root = true): void => {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (root && entry.name === ".pnpm") {
      symlinkSync(sourcePath, destinationPath, process.platform === "win32" ? "junction" : "dir");
    } else if (entry.isSymbolicLink()) {
      symlinkSync(readlinkSync(sourcePath), destinationPath);
    } else if (entry.isDirectory()) {
      mirrorNodeModules(sourcePath, destinationPath, false);
    } else {
      cpSync(sourcePath, destinationPath, { preserveTimestamps: true });
    }
  }
};

const copyWorkspaceSnapshot = (workspaceRoot: string, snapshotRoot: string): void => {
  const files = runText("git", ["ls-files", "-co", "--exclude-standard", "-z"], workspaceRoot)
    .split("\0")
    .filter((path) => path.length > 0);
  for (const path of files) {
    const source = join(workspaceRoot, path);
    const destination = join(snapshotRoot, path);
    mkdirSync(dirname(destination), { recursive: true });
    const stat = lstatSync(source);
    if (stat.isSymbolicLink()) symlinkSync(readlinkSync(source), destination);
    else
      cpSync(source, destination, {
        dereference: false,
        preserveTimestamps: true,
        recursive: stat.isDirectory(),
      });
  }
  const packageManifests = runText("git", ["ls-files", "-z", "**/package.json"], workspaceRoot)
    .split("\0")
    .filter((path) => path.length > 0);
  for (const path of ["package.json", ...packageManifests]) {
    const modules = join(dirname(path), "node_modules");
    const source = resolve(workspaceRoot, modules);
    const destination = join(snapshotRoot, modules);
    if (!existsSync(source) || existsSync(destination)) continue;
    mirrorNodeModules(source, destination);
  }
  const initialize = spawnSync("git", ["init", "--quiet"], {
    cwd: snapshotRoot,
    encoding: "utf8",
    env: gitEnvironment(),
  });
  if (initialize.error) throw initialize.error;
  if (initialize.status !== 0) throw new Error(initialize.stderr);
};

const describeTree = (
  workspaceRoot: string,
  outputs: ReadonlyArray<string>,
): Map<string, string> => {
  const entries = new Map<string, string>();
  const visit = (path: string): void => {
    const absolute = join(workspaceRoot, path);
    const stat = (() => {
      try {
        return lstatSync(absolute);
      } catch (error) {
        if (isRecord(error) && error["code"] === "ENOENT") return undefined;
        throw error;
      }
    })();
    if (stat === undefined) return;
    const normalized = path.replaceAll("\\", "/");
    if (stat.isSymbolicLink()) {
      entries.set(normalized, `link:${readlinkSync(absolute)}`);
      return;
    }
    if (stat.isDirectory()) {
      for (const child of readdirSync(absolute)) visit(join(path, child));
      return;
    }
    const digest = createHash("sha256").update(readFileSync(absolute)).digest("hex");
    entries.set(normalized, `file:${stat.mode & 0o111}:${digest}`);
  };
  for (const output of outputs) visit(output);
  return entries;
};

export const compareGeneratedOutputTrees = (
  expected: ReadonlyMap<string, string>,
  actual: ReadonlyMap<string, string>,
): string => {
  const paths = [...new Set([...expected.keys(), ...actual.keys()])].sort();
  return paths
    .flatMap((path) => {
      const before = expected.get(path);
      const after = actual.get(path);
      if (before === after) return [];
      return [`${before === undefined ? "A" : after === undefined ? "D" : "M"} ${path}`];
    })
    .join("\n");
};

/** Regenerate in a disposable snapshot so staged, unstaged, and untracked user state is immutable. */
export const findGeneratedOutputDriftWithoutMutation = (
  workspaceRoot: string,
  outputs: ReadonlyArray<string>,
  generate: (snapshotRoot: string) => void = (snapshotRoot) => {
    const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    runInherited(
      pnpm,
      ["exec", "nx", "run-many", "-t", GENERATE_TARGET, "--skip-nx-cache"],
      snapshotRoot,
      { ...gitEnvironment(), NX_DAEMON: "false" },
    );
  },
): string => {
  const snapshotRoot = mkdtempSync(join(tmpdir(), "axm-generated-output-snapshot-"));
  try {
    const expected = describeTree(workspaceRoot, outputs);
    copyWorkspaceSnapshot(workspaceRoot, snapshotRoot);
    generate(snapshotRoot);
    return compareGeneratedOutputTrees(expected, describeTree(snapshotRoot, outputs));
  } finally {
    rmSync(snapshotRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
};

const readOwnedOutputs = async (): Promise<ReadonlyArray<string>> => {
  const graph = await createProjectGraphAsync({ exitOnError: false });
  const outputs = new Set<string>();
  for (const project of Object.values(graph.nodes)) {
    if (project.data.targets?.[GENERATE_TARGET] === undefined) continue;
    for (const output of collectGeneratedOutputs(project)) outputs.add(output);
  }
  if (outputs.size === 0) {
    throw new Error("No generated outputs are declared by the resolved Nx generate targets.");
  }
  return [...outputs].sort();
};

const main = async (): Promise<void> => {
  const outputs = await readOwnedOutputs();
  const drift = findGeneratedOutputDriftWithoutMutation(nxWorkspaceRoot, outputs);
  if (drift.length === 0) return;
  console.error("Generated output drift detected in Nx-owned outputs:\n");
  console.error(drift);
  console.error("\nRun `pnpm generate` and commit the listed generated outputs.");
  process.exit(1);
};

const invokedPath = process.argv[1];
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === resolve(invokedPath))
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
