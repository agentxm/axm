import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import * as semver from "semver";

const [manager, version] = process.argv.slice(2);
if (
  !["npm", "pnpm", "yarn"].includes(manager ?? "") ||
  version === undefined ||
  semver.valid(version) !== version ||
  semver.prerelease(version) !== null
)
  throw new Error("Expected <npm|pnpm|yarn> <exact-stable-version>.");
const root = mkdtempSync(join(tmpdir(), "axm-installed-package-"));
const cwd = join(root, "outside-workspace");
mkdirSync(cwd);
const env: NodeJS.ProcessEnv = {
  ...process.env,
  AXM_NO_UPDATE_CHECK: "1",
  AXM_TELEMETRY_DISABLED: "1",
};
delete env["NODE_OPTIONS"];
delete env["NODE_PATH"];
// Nx color overrides conflict with NO_COLOR and make Node itself emit stderr.
delete env["FORCE_COLOR"];
delete env["CLICOLOR_FORCE"];
const execute = (executable: string, args: ReadonlyArray<string>, verify = false) => {
  const windows = process.platform === "win32";
  const searchPath = env["PATH"];
  // Resolve batch launchers before changing cwd: npm.cmd uses its own directory
  // to locate npm's JavaScript entrypoints.
  const command =
    windows && !isAbsolute(executable)
      ? Bun.which(`${executable}.cmd`, searchPath === undefined ? {} : { PATH: searchPath })
      : executable;
  if (command === null) throw new Error(`Cannot resolve ${executable}.cmd on PATH.`);
  // Only fixed command names, validated semver and locally generated paths reach cmd.
  const result = spawnSync(
    windows ? `"${command}"` : command,
    windows ? args.map((arg) => `"${arg}"`) : [...args],
    {
      cwd,
      env,
      encoding: "utf8",
      shell: windows,
      timeout: 180_000,
    },
  );
  if (result.error !== undefined || result.status !== 0)
    throw new Error(
      `Installed ${manager} command failed: ${result.error?.message ?? result.stderr}`,
    );
  if (verify && (result.stdout.trim() !== version || result.stderr.trim() !== ""))
    throw new Error(
      `Installed ${manager} executable did not report exactly ${version} with empty stderr: ${JSON.stringify({ stdout: result.stdout, stderr: result.stderr })}`,
    );
};
try {
  const reference = `axm.sh@${version}`;
  if (manager === "npm") {
    execute("npm", ["install", "--global", "--prefix", root, reference]);
  } else if (manager === "pnpm") {
    const bin = join(root, "bin");
    mkdirSync(bin);
    env["PNPM_HOME"] = bin;
    env["PATH"] = `${bin}${delimiter}${env["PATH"] ?? ""}`;
    execute("pnpm", [
      "add",
      "--global",
      "--global-dir",
      join(root, "global"),
      "--global-bin-dir",
      join(root, "bin"),
      reference,
    ]);
  } else {
    execute("corepack", [
      "yarn@1.22.22",
      "global",
      "add",
      "--prefix",
      root,
      "--global-folder",
      join(root, "global"),
      reference,
    ]);
  }
  execute(
    process.platform === "win32" ? join(root, "axm.cmd") : join(root, "bin", "axm"),
    ["--version"],
    true,
  );
  console.log(
    `Verified published ${reference} installed by ${manager} on ${process.platform}-${process.arch}.`,
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
