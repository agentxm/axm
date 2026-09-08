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

type JsonRecord = Record<string, unknown>;

type TargetDefinition = {
  readonly dependsOn: ReadonlyArray<unknown>;
  readonly options: JsonRecord;
  readonly outputs: ReadonlyArray<string>;
};

type ProjectDefinition = {
  readonly name: string;
  readonly root: string;
  readonly targets: Readonly<Record<string, TargetDefinition>>;
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringArray = (value: unknown, label: string): ReadonlyArray<string> => {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value;
};

const optionalArray = (value: unknown): ReadonlyArray<unknown> =>
  Array.isArray(value) ? value : [];

const optionalRecord = (value: unknown): JsonRecord => (isRecord(value) ? value : {});

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

const parseProjectDefinition = (value: unknown, expectedName: string): ProjectDefinition => {
  if (!isRecord(value) || typeof value["root"] !== "string" || !isRecord(value["targets"])) {
    throw new Error(`Nx returned an invalid project definition for ${expectedName}.`);
  }

  const targets: Record<string, TargetDefinition> = {};
  for (const [name, targetValue] of Object.entries(value["targets"])) {
    if (!isRecord(targetValue)) continue;
    targets[name] = {
      dependsOn: optionalArray(targetValue["dependsOn"]),
      options: optionalRecord(targetValue["options"]),
      outputs:
        targetValue["outputs"] === undefined
          ? []
          : stringArray(targetValue["outputs"], `${expectedName}:${name} outputs`),
    };
  }

  return { name: expectedName, root: value["root"], targets };
};

const readOption = (options: JsonRecord, key: string): string => {
  const value = options[key];
  if (typeof value !== "string") {
    throw new Error(`Generated output token {options.${key}} does not resolve to a string.`);
  }
  return value;
};

export const resolveGeneratedOutput = (
  template: string,
  project: ProjectDefinition,
  target: TargetDefinition,
): string => {
  const output = template.replaceAll(/\{([^}]+)\}/gu, (_match, token: string) => {
    if (token === "workspaceRoot") return "";
    if (token === "projectRoot") return project.root;
    if (token === "projectName") return project.name;
    if (token.startsWith("options.")) return readOption(target.options, token.slice(8));
    throw new Error(`Unsupported generated output token {${token}} in ${project.name}.`);
  });
  const normalized = output.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
  if (normalized.length === 0 || normalized === "." || normalized.startsWith("../")) {
    throw new Error(`Generated output ${template} resolves outside the workspace.`);
  }
  return normalized;
};

export const collectGeneratedOutputs = (
  project: ProjectDefinition,
  entryTarget = "generate",
): ReadonlyArray<string> => {
  const visited = new Set<string>();
  const outputs = new Set<string>();

  const visit = (targetName: string): void => {
    if (visited.has(targetName)) return;
    visited.add(targetName);
    const target = project.targets[targetName];
    if (!target) throw new Error(`Nx project ${project.name} has no ${targetName} target.`);

    for (const output of target.outputs) {
      outputs.add(resolveGeneratedOutput(output, project, target));
    }
    for (const dependency of target.dependsOn) {
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
    mkdirSync(dirname(destination), { recursive: true });
    symlinkSync(source, destination, process.platform === "win32" ? "junction" : "dir");
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
      ["exec", "nx", "run-many", "-t", "generate", "--skip-nx-cache"],
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

const readOwnedOutputs = (workspaceRoot: string): ReadonlyArray<string> => {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const graphValue: unknown = JSON.parse(
    runText(pnpm, ["exec", "nx", "graph", "--file=stdout"], workspaceRoot),
  );
  if (!isRecord(graphValue) || !isRecord(graphValue["graph"])) {
    throw new Error("Nx returned an invalid project graph.");
  }
  const graph = graphValue["graph"];
  if (!isRecord(graph["nodes"])) throw new Error("Nx project graph has no nodes.");
  const outputs = new Set<string>();
  for (const [name, nodeValue] of Object.entries(graph["nodes"])) {
    if (!isRecord(nodeValue) || !isRecord(nodeValue["data"])) continue;
    const projectValue = nodeValue["data"];
    if (!isRecord(projectValue["targets"]) || projectValue["targets"]["generate"] === undefined) {
      continue;
    }
    for (const output of collectGeneratedOutputs(parseProjectDefinition(projectValue, name))) {
      outputs.add(output);
    }
  }
  if (outputs.size === 0) {
    throw new Error("No generated outputs are declared by the resolved Nx generate targets.");
  }
  return [...outputs].sort();
};

const main = (): void => {
  const workspaceRoot = process.cwd();
  const outputs = readOwnedOutputs(workspaceRoot);
  const drift = findGeneratedOutputDriftWithoutMutation(workspaceRoot, outputs);
  if (drift.length === 0) return;
  console.error("Generated output drift detected in Nx-owned outputs:\n");
  console.error(drift);
  console.error("\nRun `pnpm generate` and commit the listed generated outputs.");
  process.exit(1);
};

const invokedPath = process.argv[1];
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === resolve(invokedPath)) main();
