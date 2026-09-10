import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectGraphProjectNode, TargetConfiguration } from "@nx/devkit";
import {
  collectGeneratedOutputs,
  findGeneratedOutputDrift,
  findGeneratedOutputDriftWithoutMutation,
  mirrorNodeModules,
} from "./generated-output-guard.js";

const temporaryDirectories: Array<string> = [];

const projectNode = (targets: Record<string, TargetConfiguration>): ProjectGraphProjectNode => ({
  name: "client",
  type: "lib",
  data: { root: "packages/client", targets },
});

const isolatedGitEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
);

const git = (directory: string, ...args: ReadonlyArray<string>): void => {
  const result = spawnSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    env: isolatedGitEnvironment,
  });
  if (result.status !== 0) throw new Error(result.stderr);
};

const gitText = (directory: string, ...args: ReadonlyArray<string>): string => {
  const result = spawnSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    env: isolatedGitEnvironment,
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
};

const makeRepository = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "axm-generated-output-"));
  temporaryDirectories.push(directory);
  git(directory, "init", "--quiet");
  git(directory, "config", "user.email", "generated-output@example.invalid");
  git(directory, "config", "user.name", "Generated output test");
  mkdirSync(join(directory, "generated"));
  writeFileSync(join(directory, "generated", "client.ts"), "export const value = 1;\n");
  writeFileSync(join(directory, "source.ts"), "export const source = 1;\n");
  git(directory, "add", ".");
  git(directory, "commit", "--quiet", "-m", "fixture");
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    chmodSync(directory, 0o700);
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("generated output guard", () => {
  it("keeps workspace dependency links inside the snapshot while sharing the external store", () => {
    const source = mkdtempSync(join(tmpdir(), "axm-generated-modules-source-"));
    const snapshot = mkdtempSync(join(tmpdir(), "axm-generated-modules-snapshot-"));
    temporaryDirectories.push(source, snapshot);
    mkdirSync(join(source, "node_modules", ".pnpm"), { recursive: true });
    mkdirSync(join(source, "node_modules", "@agentxm"));
    mkdirSync(join(source, "packages", "core", "extension-model"), { recursive: true });
    mkdirSync(join(snapshot, "packages", "core", "extension-model"), { recursive: true });
    symlinkSync(
      "../../packages/core/extension-model",
      join(source, "node_modules", "@agentxm", "extension-model"),
    );

    mirrorNodeModules(join(source, "node_modules"), join(snapshot, "node_modules"));

    expect(realpathSync(join(snapshot, "node_modules", "@agentxm", "extension-model"))).toBe(
      realpathSync(join(snapshot, "packages", "core", "extension-model")),
    );
    expect(realpathSync(join(snapshot, "node_modules", ".pnpm"))).toBe(
      realpathSync(join(source, "node_modules", ".pnpm")),
    );
  });

  it("derives owned outputs from a generate target and its local generator dependencies", () => {
    const outputs = collectGeneratedOutputs(
      projectNode({
        generate: { dependsOn: ["generate:client", "^build"], options: {} },
        "generate:client": {
          dependsOn: [],
          options: { outputPath: "src/__generated__" },
          outputs: ["{projectRoot}/{options.outputPath}", "{workspaceRoot}/schema.json"],
        },
      }),
    );

    expect(outputs).toEqual(["packages/client/src/__generated__", "schema.json"]);
  });

  it("claims no ownership for a target that declares no outputs", () => {
    expect(
      collectGeneratedOutputs(
        projectNode({ generate: { options: { outputPath: "src/__generated__" } } }),
      ),
    ).toEqual([]);
  });

  it.each([
    ["a missing option", "{projectRoot}/{options.outputPath}"],
    ["an unknown token", "{projectRoot}/{outputPath}"],
  ])("fails when a declared output carries %s", (_label, output) => {
    expect(() =>
      collectGeneratedOutputs(projectNode({ generate: { options: {}, outputs: [output] } })),
    ).toThrow(/do not resolve/u);
  });

  it("ignores unrelated dirty files while naming modified, deleted, and added owned outputs", () => {
    const directory = makeRepository();
    writeFileSync(join(directory, "source.ts"), "export const source = 2;\n");
    expect(findGeneratedOutputDrift(directory, ["generated"])).toBe("");

    writeFileSync(join(directory, "generated", "client.ts"), "export const value = 2;\n");
    expect(findGeneratedOutputDrift(directory, ["generated"])).toContain("generated/client.ts");

    writeFileSync(join(directory, "generated", "client.ts"), "export const value = 1;\n");
    unlinkSync(join(directory, "generated", "client.ts"));
    expect(findGeneratedOutputDrift(directory, ["generated"])).toContain("generated/client.ts");

    writeFileSync(join(directory, "generated", "new.ts"), "export const added = true;\n");
    expect(findGeneratedOutputDrift(directory, ["generated"])).toContain("generated/new.ts");
  });

  it("reports a tracked owned output deleted from the working tree instead of failing to snapshot", () => {
    const directory = makeRepository();
    const generated = join(directory, "generated", "client.ts");
    unlinkSync(generated);
    const beforeStatus = gitText(directory, "status", "--porcelain=v2", "-z");

    const drift = findGeneratedOutputDriftWithoutMutation(directory, ["generated"], (snapshot) => {
      mkdirSync(join(snapshot, "generated"), { recursive: true });
      writeFileSync(join(snapshot, "generated", "client.ts"), "export const value = 1;\n");
    });

    expect(drift).toContain("generated/client.ts");
    expect(existsSync(generated)).toBe(false);
    expect(gitText(directory, "status", "--porcelain=v2", "-z")).toBe(beforeStatus);
  });

  it("detects drift without changing staged, unstaged, or untracked state", () => {
    const directory = makeRepository();
    const generated = join(directory, "generated", "client.ts");
    const untracked = join(directory, "generated", "new.ts");
    writeFileSync(generated, "export const value = 2;\n");
    git(directory, "add", "generated/client.ts");
    writeFileSync(generated, "export const value = 3;\n");
    writeFileSync(join(directory, "source.ts"), "export const source = 2;\n");
    writeFileSync(untracked, "export const added = true;\n");
    const beforeStatus = gitText(directory, "status", "--porcelain=v2", "-z");
    const beforeGenerated = readFileSync(generated, "utf8");
    const beforeUntracked = readFileSync(untracked, "utf8");

    const drift = findGeneratedOutputDriftWithoutMutation(directory, ["generated"], (snapshot) => {
      writeFileSync(join(snapshot, "generated", "client.ts"), "export const value = 4;\n");
      rmSync(join(snapshot, "generated", "new.ts"));
    });

    expect(drift).toContain("M generated/client.ts");
    expect(drift).toContain("D generated/new.ts");
    expect(gitText(directory, "status", "--porcelain=v2", "-z")).toBe(beforeStatus);
    expect(readFileSync(generated, "utf8")).toBe(beforeGenerated);
    expect(readFileSync(untracked, "utf8")).toBe(beforeUntracked);
  });
});
