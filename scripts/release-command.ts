import { execFileSync } from "node:child_process";

export const printCommand = (command: string, args: readonly string[]) => {
  console.log(`\n==> ${command} ${args.join(" ")}`);
};

export const run = (command: string, args: readonly string[], env?: NodeJS.ProcessEnv) => {
  printCommand(command, args);
  execFileSync(command, [...args], {
    stdio: "inherit",
    env: env ?? process.env,
  });
};

export const capture = (
  command: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
): string =>
  execFileSync(command, [...args], {
    encoding: "utf8",
    env: env ?? process.env,
  }).trim();

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
