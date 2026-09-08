import { execFileSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";

const REPOSITORY_LOCAL_GIT_VARIABLES = new Set([
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CEILING_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_PREFIX",
  "GIT_WORK_TREE",
]);

export const foreignGitEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(environment).filter(([key]) => !REPOSITORY_LOCAL_GIT_VARIABLES.has(key)),
  );

const runWithOptions = (
  command: string,
  args: readonly string[],
  options: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv },
) => {
  printCommand(command, args);
  execFileSync(command, [...args], {
    stdio: "inherit",
    env: options.env ?? process.env,
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  });
};

const captureWithOptions = (
  command: string,
  args: readonly string[],
  options: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv },
): string =>
  execFileSync(command, [...args], {
    encoding: "utf8",
    env: options.env ?? process.env,
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  }).trim();

export const printCommand = (command: string, args: readonly string[]) => {
  console.log(`\n==> ${command} ${args.join(" ")}`);
};

export const run = (command: string, args: readonly string[], env?: NodeJS.ProcessEnv) => {
  runWithOptions(command, args, env === undefined ? {} : { env });
};

export const runIn = (
  cwd: string,
  command: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
) => runWithOptions(command, args, env === undefined ? { cwd } : { cwd, env });

export const capture = (
  command: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
): string => captureWithOptions(command, args, env === undefined ? {} : { env });

export const captureIn = (
  cwd: string,
  command: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
): string => captureWithOptions(command, args, env === undefined ? { cwd } : { cwd, env });

export const requireForeignGitRoot = (
  cwd: string,
  expectedRoot: string,
  environment: NodeJS.ProcessEnv = process.env,
): void => {
  const env = foreignGitEnvironment(environment);
  const topLevel = resolve(captureIn(cwd, "git", ["rev-parse", "--show-toplevel"], env));
  const expected = resolve(expectedRoot);
  if (topLevel !== expected)
    throw new Error(`Foreign Git root mismatch: expected ${expected}, observed ${topLevel}.`);
  const commonValue = captureIn(cwd, "git", ["rev-parse", "--git-common-dir"], env);
  const common = resolve(cwd, commonValue);
  const commonRelative = relative(expected, common);
  if (commonRelative.startsWith("..") || isAbsolute(commonRelative))
    throw new Error(`Foreign Git common directory escapes ${expected}: ${common}.`);
};

export const tryCapture = (
  command: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
): { ok: true; stdout: string } | { ok: false; stderr: string } => {
  try {
    return {
      ok: true,
      stdout: capture(command, args, env),
    };
  } catch (error) {
    const stderr =
      error instanceof Error && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr.trim()
        : error instanceof Error
          ? error.message
          : String(error);
    return { ok: false, stderr };
  }
};
