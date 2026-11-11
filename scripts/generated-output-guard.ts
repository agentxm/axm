import { createHash } from "node:crypto";
import { symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import * as Schedule from "effect/Schedule";
import * as ChildProcess from "effect/process/ChildProcess";
import {
  createProjectGraphAsync,
  getOutputsForTargetAndConfiguration,
  workspaceRoot as nxWorkspaceRoot,
  type ProjectGraphProjectNode,
  type TargetConfiguration,
} from "@nx/devkit";
import { runVerificationCommand, VerificationFailed } from "./verification-process.js";

const GENERATE_TARGET = "generate";

const gitEnvironment = (): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));

const runText = (command: string, args: ReadonlyArray<string>, cwd: string) =>
  runVerificationCommand(
    ChildProcess.make(command, args, { cwd, env: gitEnvironment(), extendEnv: false }),
  ).pipe(Effect.map(({ stdout }) => stdout));

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

export const findGeneratedOutputDrift = (workspaceRoot: string, outputs: ReadonlyArray<string>) =>
  runText(
    "git",
    ["status", "--short", "--untracked-files=all", "--", ...outputs],
    workspaceRoot,
  ).pipe(Effect.map((output) => output.trim()));

/** A deleted working-tree path is absent from the snapshot; other failures remain errors. */
const lstatIfPresent = (fs: FileSystem.FileSystem, path: string) =>
  fs.lstat(path).pipe(
    Effect.map(Option.some),
    Effect.catchIf(
      (error) => error.reason._tag === "NotFound",
      () => Effect.succeedNone,
    ),
  );

export const mirrorNodeModules = (
  source: string,
  destination: string,
  root = true,
): Effect.Effect<
  void,
  PlatformError.PlatformError | VerificationFailed,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(destination, { recursive: true }).pipe(Effect.uninterruptible);
    for (const entry of yield* fs.readDirectoryEntries(source)) {
      const sourcePath = path.join(source, entry.name);
      const destinationPath = path.join(destination, entry.name);
      if (root && entry.name === ".pnpm") {
        if (process.platform === "win32") {
          // FileSystem.symlink has no junction option. Await this uncancellable
          // host call before interruption can release the snapshot directory.
          yield* Effect.tryPromise({
            try: () => symlink(sourcePath, destinationPath, "junction"),
            catch: (cause) =>
              new VerificationFailed({
                detail: "Could not share the package store with the snapshot.",
                cause,
              }),
          }).pipe(Effect.uninterruptible);
        } else yield* fs.symlink(sourcePath, destinationPath).pipe(Effect.uninterruptible);
      } else {
        const info = yield* fs.lstat(sourcePath);
        if (info.type === "SymbolicLink")
          yield* fs
            .symlink(yield* fs.readLink(sourcePath), destinationPath)
            .pipe(Effect.uninterruptible);
        else if (info.type === "Directory")
          yield* mirrorNodeModules(sourcePath, destinationPath, false);
        else
          yield* fs
            .copy(sourcePath, destinationPath, { preserveTimestamps: true })
            .pipe(Effect.uninterruptible);
      }
    }
  });

const copyWorkspaceSnapshot = Effect.fnUntraced(function* (
  workspaceRoot: string,
  snapshotRoot: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const files = (yield* runText(
    "git",
    ["ls-files", "-co", "--exclude-standard", "-z"],
    workspaceRoot,
  ))
    .split("\0")
    .filter((file) => file.length > 0);
  for (const file of files) {
    const source = path.join(workspaceRoot, file);
    // The index can still name a file deleted from the working-tree view.
    const info = yield* lstatIfPresent(fs, source);
    if (Option.isNone(info)) continue;
    const destination = path.join(snapshotRoot, file);
    yield* fs
      .makeDirectory(path.dirname(destination), { recursive: true })
      .pipe(Effect.uninterruptible);
    if (info.value.type === "SymbolicLink")
      yield* fs.symlink(yield* fs.readLink(source), destination).pipe(Effect.uninterruptible);
    else
      yield* fs
        .copy(source, destination, { preserveTimestamps: true })
        .pipe(Effect.uninterruptible);
  }
  // New untracked package manifests participate in the same working-tree view.
  const manifests = (yield* runText(
    "git",
    ["ls-files", "-co", "--exclude-standard", "-z", "**/package.json"],
    workspaceRoot,
  ))
    .split("\0")
    .filter((file) => file.length > 0);
  for (const file of ["package.json", ...manifests]) {
    const modules = path.join(path.dirname(file), "node_modules");
    const source = path.resolve(workspaceRoot, modules);
    const destination = path.join(snapshotRoot, modules);
    if (!(yield* fs.exists(source)) || (yield* fs.exists(destination))) continue;
    yield* mirrorNodeModules(source, destination);
  }
  yield* runText("git", ["init", "--quiet"], snapshotRoot);
});

const describeTree = Effect.fnUntraced(function* (
  workspaceRoot: string,
  outputs: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entries = new Map<string, string>();
  const visit = (relative: string): Effect.Effect<void, PlatformError.PlatformError> =>
    Effect.gen(function* () {
      const absolute = path.join(workspaceRoot, relative);
      const info = yield* lstatIfPresent(fs, absolute);
      if (Option.isNone(info)) return;
      const normalized = relative.replaceAll("\\", "/");
      if (info.value.type === "SymbolicLink") {
        entries.set(normalized, `link:${yield* fs.readLink(absolute)}`);
      } else if (info.value.type === "Directory") {
        for (const child of yield* fs.readDirectory(absolute))
          yield* visit(path.join(relative, child));
      } else {
        const digest = createHash("sha256")
          .update(yield* fs.readFile(absolute))
          .digest("hex");
        entries.set(normalized, `file:${info.value.mode & 0o111}:${digest}`);
      }
    });
  for (const output of outputs) yield* visit(output);
  return entries;
});

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

const generateSnapshot = (snapshotRoot: string) => {
  const words = ["pnpm.cmd", "exec", "nx", "run-many", "-t", GENERATE_TARGET, "--skip-nx-cache"];
  // The Windows script contains only fixed command words, never workspace paths.
  const command =
    process.platform === "win32"
      ? ChildProcess.make(words.join(" "), {
          shell: true,
          cwd: snapshotRoot,
          env: { ...gitEnvironment(), NX_DAEMON: "false" },
          extendEnv: false,
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        })
      : ChildProcess.make("pnpm", words.slice(1), {
          cwd: snapshotRoot,
          env: { ...gitEnvironment(), NX_DAEMON: "false" },
          extendEnv: false,
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        });
  return runVerificationCommand(command);
};

/** Regenerate in a scoped snapshot without changing staged, unstaged, or untracked user state. */
export const findGeneratedOutputDriftWithoutMutation = <A, E, R>(
  workspaceRoot: string,
  outputs: ReadonlyArray<string>,
  generate: (snapshotRoot: string) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* Effect.acquireUseRelease(
      fs.makeTempDirectory({ prefix: "axm-generated-output-snapshot-" }),
      (snapshotRoot) =>
        Effect.gen(function* () {
          const expected = yield* describeTree(workspaceRoot, outputs);
          yield* copyWorkspaceSnapshot(workspaceRoot, snapshotRoot);
          yield* generate(snapshotRoot);
          return compareGeneratedOutputTrees(expected, yield* describeTree(snapshotRoot, outputs));
        }),
      (directory) =>
        fs
          .remove(directory, { recursive: true, force: true })
          .pipe(Effect.retry(Schedule.spaced("100 millis").pipe(Schedule.upTo({ times: 5 })))),
    );
  });

const readOwnedOutputs = Effect.gen(function* () {
  const graph = yield* Effect.tryPromise({
    try: () => createProjectGraphAsync({ exitOnError: false }),
    catch: (cause) =>
      new VerificationFailed({ detail: "Could not resolve the Nx project graph.", cause }),
  });
  return yield* Effect.try({
    try: () => {
      const outputs = new Set<string>();
      for (const project of Object.values(graph.nodes)) {
        if (project.data.targets?.[GENERATE_TARGET] === undefined) continue;
        for (const output of collectGeneratedOutputs(project)) outputs.add(output);
      }
      if (outputs.size === 0)
        throw new Error("No generated outputs are declared by the resolved Nx generate targets.");
      return [...outputs].sort();
    },
    catch: (cause) =>
      new VerificationFailed({ detail: "Could not resolve generated output ownership.", cause }),
  });
});

const main = Effect.gen(function* () {
  const outputs = yield* readOwnedOutputs;
  const drift = yield* findGeneratedOutputDriftWithoutMutation(
    nxWorkspaceRoot,
    outputs,
    generateSnapshot,
  );
  if (drift.length > 0)
    return yield* new VerificationFailed({
      detail: `Generated output drift detected in Nx-owned outputs:\n\n${drift}\n\nRun \`pnpm generate\` and commit the listed generated outputs.`,
    });
});

const invokedPath = process.argv[1];
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === resolve(invokedPath))
  NodeRuntime.runMain(
    main.pipe(
      Effect.provide(NodeServices.layer),
      Effect.tapCause((cause) => Console.error(Cause.pretty(cause))),
    ),
    { disableErrorReporting: true },
  );
