import { execFileSync } from "node:child_process";

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
