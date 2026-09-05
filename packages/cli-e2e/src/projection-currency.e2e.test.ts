import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { format } from "prettier";
import { describe, expect, it } from "vitest";

import { createTempDir, runCli } from "./e2e/utils.js";

export const executionBinding = {
  requirements: [
    "cli/projection-currency-follows-state-authority",
    "cli/install/reinstall-is-idempotent",
  ],
  boundary: "process",
  rationale:
    "Runs a real Markdown formatter between projection and the packaged CLI, then proves both lint views, preview, sync, and reinstall preserve the formatted bytes.",
} as const;

const GIT_REPOSITORY_ENVIRONMENT_VARIABLES = new Set([
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_CONFIG",
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_PARAMETERS",
  "GIT_DIR",
  "GIT_GRAFT_FILE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_OBJECT_DIRECTORY",
  "GIT_PREFIX",
  "GIT_REPLACE_REF_BASE",
  "GIT_SHALLOW_FILE",
  "GIT_WORK_TREE",
]);

const isolatedGitEnvironment = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !GIT_REPOSITORY_ENVIRONMENT_VARIABLES.has(entry[0]),
    ),
  );

const git = (root: string, args: ReadonlyArray<string>): string =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...isolatedGitEnvironment(), GIT_TERMINAL_PROMPT: "0" },
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const findingsFrom = (stdout: string): ReadonlyArray<unknown> => {
  const document: unknown = JSON.parse(stdout);
  if (
    !isRecord(document) ||
    !isRecord(document["result"]) ||
    !Array.isArray(document["result"]["findings"])
  ) {
    throw new Error("Expected a lint result document");
  }
  return document["result"]["findings"];
};

describe("generated projection currency at the process boundary", () => {
  it("preserves real formatter output through lint, preview, sync, and reinstall", async () => {
    const temp = createTempDir("axm-projection-currency-");
    try {
      const env = {
        HOME: temp.path,
        AXM_USER_HOME: temp.path,
        DO_NOT_TRACK: "1",
      };
      const setup = await runCli(
        ["setup", "--scope", "project", "--agent", "claude-code", "--yes", "--non-interactive"],
        { cwd: temp.path, env },
      );
      expect(setup.exitCode, `${setup.stderr}\n${setup.stdout}`).toBe(0);

      const settingsPath = path.join(temp.path, "axm.json");
      const settings: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (!isRecord(settings)) throw new Error("Expected object-valued workspace settings");
      fs.writeFileSync(
        settingsPath,
        `${JSON.stringify(
          {
            ...settings,
            owner: "@test",
            instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
          },
          null,
          2,
        )}\n`,
      );

      const scaffold = await runCli(
        ["rules", "new", "review", "--owner", "@test", "--non-interactive"],
        { cwd: temp.path, env },
      );
      expect(scaffold.exitCode, `${scaffold.stderr}\n${scaffold.stdout}`).toBe(0);

      fs.writeFileSync(
        path.join(temp.path, "rules", "review", "src", "RULE.md"),
        [
          "# Review",
          "",
          "Use this deliberately long sentence to verify that a repository formatter may wrap generated prose without creating AXM reconciliation work.",
          "",
          "|check|result|",
          "|-|-|",
          "|ownership|valid|",
          "",
        ].join("\n"),
      );
      const projected = await runCli(["sync", "--json", "--non-interactive"], {
        cwd: temp.path,
        env,
      });
      expect(projected.exitCode, `${projected.stderr}\n${projected.stdout}`).toBe(0);

      const instructionsPath = path.join(temp.path, "AGENTS.md");
      const generated = fs.readFileSync(instructionsPath, "utf8");
      const formatted = await format(generated, {
        parser: "markdown",
        printWidth: 60,
        proseWrap: "always",
      });
      expect(formatted).not.toBe(generated);
      fs.writeFileSync(instructionsPath, formatted);

      git(temp.path, ["init", "--quiet", "--initial-branch=main"]);
      git(temp.path, ["add", "."]);

      const workspaceLint = await runCli(["lint", "--strict", "--json"], {
        cwd: temp.path,
        env,
      });
      expect(workspaceLint.exitCode, `${workspaceLint.stderr}\n${workspaceLint.stdout}`).toBe(0);
      expect(findingsFrom(workspaceLint.stdout)).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: "workspace/projection-ownership-valid" }),
        ]),
      );
      expect(fs.readFileSync(instructionsPath, "utf8")).toBe(formatted);

      const indexLint = await runCli(["lint", "--view", "git-index", "--strict", "--json"], {
        cwd: temp.path,
        env,
      });
      expect(indexLint.exitCode, `${indexLint.stderr}\n${indexLint.stdout}`).toBe(0);
      expect(findingsFrom(indexLint.stdout)).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: "workspace/projection-ownership-valid" }),
        ]),
      );
      expect(fs.readFileSync(instructionsPath, "utf8")).toBe(formatted);

      const preview = await runCli(
        ["sync", "--preview", "--fail-on-change", "--json", "--non-interactive"],
        { cwd: temp.path, env },
      );
      expect(preview.exitCode, `${preview.stderr}\n${preview.stdout}`).toBe(0);
      expect(JSON.parse(preview.stdout)).toMatchObject({ result: { outcome: "no-op" } });
      expect(fs.readFileSync(instructionsPath, "utf8")).toBe(formatted);

      const sync = await runCli(["sync", "--json", "--non-interactive"], {
        cwd: temp.path,
        env,
      });
      expect(sync.exitCode, `${sync.stderr}\n${sync.stdout}`).toBe(0);
      expect(JSON.parse(sync.stdout)).toMatchObject({ result: { outcome: "no-op" } });
      expect(fs.readFileSync(instructionsPath, "utf8")).toBe(formatted);

      const reinstall = await runCli(["rules", "install", "--json", "--non-interactive"], {
        cwd: temp.path,
        env,
      });
      expect(reinstall.exitCode, `${reinstall.stderr}\n${reinstall.stdout}`).toBe(0);
      expect(fs.readFileSync(instructionsPath, "utf8")).toBe(formatted);
    } finally {
      temp.cleanup();
    }
  });
});
