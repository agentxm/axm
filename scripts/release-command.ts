/** Command primitives for pre-install CI; installed foreign Git helpers live separately. */
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
): string => {
  printCommand(command, args);
  return execFileSync(command, [...args], {
    encoding: "utf8",
    // Release listings (tracked paths at a ref, paginated GitHub responses)
    // outgrow the 1 MiB default long before they stop being reasonable.
    maxBuffer: 64 * 1024 * 1024,
    env: options.env ?? process.env,
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  }).trim();
};

/**
 * Unbuffered stderr, so CI job logs timestamp each command rather than the
 * whole script, and captured stdout stays clean.
 */
const printCommand = (command: string, args: readonly string[]) => {
  process.stderr.write(
    `\n==> [+${Math.round(performance.now())}ms] ${command} ${args.join(" ")}\n`,
  );
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
