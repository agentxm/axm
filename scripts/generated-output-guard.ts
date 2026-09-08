import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
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

const runText = (command: string, args: ReadonlyArray<string>, cwd: string): string => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
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

const runInherited = (command: string, args: ReadonlyArray<string>, cwd: string): void => {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
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
  ).trim();

const readOwnedOutputs = (workspaceRoot: string): ReadonlyArray<string> => {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const namesValue: unknown = JSON.parse(
    runText(
      pnpm,
      ["exec", "nx", "show", "projects", "--with-target", "generate", "--json"],
      workspaceRoot,
    ),
  );
  const names = stringArray(namesValue, "Nx generate project selection");
  const outputs = new Set<string>();
  for (const name of names) {
    const projectValue: unknown = JSON.parse(
      runText(pnpm, ["exec", "nx", "show", "project", name, "--json"], workspaceRoot),
    );
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
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  runInherited(
    pnpm,
    ["exec", "nx", "run-many", "-t", "generate", "--skip-nx-cache"],
    workspaceRoot,
  );
  const drift = findGeneratedOutputDrift(workspaceRoot, outputs);
  if (drift.length === 0) return;
  console.error("Generated output drift detected in Nx-owned outputs:\n");
  console.error(drift);
  console.error("\nRun `pnpm generate` and commit the listed generated outputs.");
  process.exit(1);
};

const invokedPath = process.argv[1];
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === resolve(invokedPath)) main();
