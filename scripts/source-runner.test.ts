import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

type ProcessResult = {
  readonly code: number | null;
  readonly output: string;
};

const read = (filePath: string): string => readFileSync(filePath, "utf8");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isStringArray = (value: unknown): value is ReadonlyArray<string> =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const readObject = (filePath: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(read(filePath));
  if (!isRecord(value)) throw new Error(`${filePath} must contain a JSON object.`);
  return value;
};

const topLevelProcessEnv = (): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !/^(?:npm_|pnpm_)/iu.test(name) && name !== "INIT_CWD",
    ),
  );

const runProcess = (command: string, args: ReadonlyArray<string>, cwd: string) =>
  new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...topLevelProcessEnv(),
        CI: "true",
        NX_DEFAULT_OUTPUT_STYLE: "static",
        NX_TASKS_RUNNER_DYNAMIC_OUTPUT: "false",
        NX_TUI: "false",
      },
    });
    let output = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      output += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });

describe("source runner", () => {
  it("maps every publishable runtime package export to workspace source", () => {
    let checkedExports = 0;
    let checkedPackages = 0;

    for (const entry of readdirSync("packages", { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const packageRoot = path.join("packages", entry.name);
      const manifestPath = path.join(packageRoot, "package.json");
      if (!existsSync(manifestPath)) continue;

      const manifest = readObject(manifestPath);
      const packageName = manifest["name"];
      const files = manifest["files"];
      if (
        typeof packageName !== "string" ||
        !packageName.startsWith("@agentxm/") ||
        !isStringArray(files) ||
        !files.includes("dist/src/")
      ) {
        continue;
      }

      const packageExports = manifest["exports"];
      if (!isRecord(packageExports)) {
        throw new Error(`${manifestPath} must declare package exports.`);
      }
      checkedPackages += 1;

      for (const [subpath, exportTarget] of Object.entries(packageExports)) {
        if (!isRecord(exportTarget)) continue;

        const defaultTarget = exportTarget["default"];
        if (
          typeof defaultTarget !== "string" ||
          !defaultTarget.startsWith("./dist/src/") ||
          !defaultTarget.endsWith(".js")
        ) {
          continue;
        }

        const expectedSourceTarget = defaultTarget
          .replace("./dist/src/", "./src/")
          .replace(/\.js$/u, ".ts");
        const message = `${packageName} ${subpath}`;

        expect(Object.keys(exportTarget), message).toEqual(["types", "axm-source", "default"]);
        expect(exportTarget["axm-source"], message).toBe(expectedSourceTarget);
        expect(existsSync(path.join(packageRoot, expectedSourceTarget)), message).toBe(true);
        checkedExports += 1;
      }
    }

    expect(checkedPackages).toBeGreaterThan(0);
    expect(checkedExports).toBeGreaterThan(0);
  });

  it("launches the source smoke before build-backed clean verification", () => {
    const manifest = readObject("package.json");
    const scripts = manifest["scripts"];
    if (!isRecord(scripts)) throw new Error("package.json must declare scripts.");
    expect(scripts["axm"]).toBe("bun --conditions=axm-source packages/cli/src/main.ts");
    expect(scripts["verify:clean"]).toMatch(/^pnpm exec nx run axm:source-cli-smoke &&/u);

    const project = readObject("project.json");
    const targets = project["targets"];
    if (!isRecord(targets)) throw new Error("project.json must declare targets.");
    const smoke = targets["source-cli-smoke"];
    if (!isRecord(smoke)) throw new Error("Missing source-cli-smoke target.");
    const options = smoke["options"];
    if (!isRecord(options)) throw new Error("source-cli-smoke must declare options.");

    expect(smoke["cache"]).toBe(false);
    expect(smoke["dependsOn"]).toBeUndefined();
    expect(options["command"]).toBe("pnpm axm --version");
  });

  it("fails concurrent unprepared commands before dependency mutation", async () => {
    expect(read("pnpm-workspace.yaml")).toMatch(/^verifyDepsBeforeRun: error$/mu);

    const fixtureRoot = mkdtempSync(path.join(tmpdir(), "axm-unprepared-workspace-"));
    try {
      writeFileSync(
        path.join(fixtureRoot, "package.json"),
        `${JSON.stringify(
          {
            scripts: {
              probe: `node -e "require('node:fs').writeFileSync('ran', 'yes')"`,
            },
            dependencies: { semver: "7.7.2" },
          },
          undefined,
          2,
        )}\n`,
      );
      writeFileSync(path.join(fixtureRoot, "pnpm-workspace.yaml"), "verifyDepsBeforeRun: error\n");

      const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
      const results = await Promise.all(
        Array.from({ length: 5 }, () => runProcess(pnpm, ["run", "probe"], fixtureRoot)),
      );

      for (const result of results) {
        expect(result.code).not.toBe(0);
        expect(result.output).toContain("ERR_PNPM_VERIFY_DEPS_BEFORE_RUN");
        expect(result.output).toContain('Run "pnpm install"');
      }
      expect(existsSync(path.join(fixtureRoot, "node_modules"))).toBe(false);
      expect(existsSync(path.join(fixtureRoot, "ran"))).toBe(false);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
