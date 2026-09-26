/** Publish fixture content through the built CLI into a Registry location. */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

import { createTempDir, runCli } from "../e2e/utils.js";

const registryEnv = (): Record<string, string> => ({ AXM_TOKEN: "e2e-test-token" });

export const initWorkspace = async (workspacePath: string, location: string, owner: string) => {
  const setup = await runCli(["setup", "--yes", "--scope", "project", "--agent", "claude-code"], {
    cwd: workspacePath,
    env: registryEnv(),
  });
  expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
  const settingsPath = path.join(workspacePath, "axm.json");
  const settings: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
    throw new Error("Expected workspace settings object");
  }
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        ...settings,
        defaultRegistry: "test",
        sources: [{ name: "test", type: "registry", location }],
        owner,
        minimumReleaseAge: "0s",
      },
      null,
      2,
    ),
  );
};

export const publishExtension = async (args: {
  readonly registryLocation: string;
  readonly owner: string;
  readonly plural: string;
  readonly name: string;
  readonly newArgs?: ReadonlyArray<string>;
  readonly versionChange?: "major";
  /** Complete authored entry document when the extension is a Skill. */
  readonly skillDocument?: string;
}) => {
  const workspace = createTempDir();
  try {
    if (args.registryLocation.startsWith("file://")) {
      fs.mkdirSync(fileURLToPath(args.registryLocation), { recursive: true });
    }
    await initWorkspace(workspace.path, args.registryLocation, args.owner);
    const created = await runCli(
      [args.plural, "new", args.name, "--owner", args.owner, ...(args.newArgs ?? [])],
      { cwd: workspace.path, env: registryEnv() },
    );
    expect(created.exitCode, created.stdout + created.stderr).toBe(0);
    if (args.versionChange !== undefined) {
      const versioned = await runCli(
        ["version", `${args.owner}/${args.plural}/${args.name}`, args.versionChange],
        { cwd: workspace.path, env: registryEnv() },
      );
      expect(versioned.exitCode, versioned.stdout + versioned.stderr).toBe(0);
    }
    if (args.skillDocument !== undefined) {
      fs.writeFileSync(
        path.join(workspace.path, "skills", args.name, "src", "SKILL.md"),
        args.skillDocument,
      );
    }
    const published = await runCli(
      [args.plural, "publish", `${args.owner}/${args.plural}/${args.name}`],
      { cwd: workspace.path, env: registryEnv() },
    );
    expect(published.exitCode, published.stdout + published.stderr).toBe(0);
  } finally {
    workspace.cleanup();
  }
};

export const publishSkill = (args: {
  readonly registryLocation: string;
  readonly owner: string;
  readonly name: string;
  readonly body: string;
}) =>
  publishExtension({
    registryLocation: args.registryLocation,
    owner: args.owner,
    plural: "skills",
    name: args.name,
    versionChange: "major",
    skillDocument: `---\nname: ${args.name}\ndescription: The ${args.name} skill.\n---\n\n# ${args.name}\n\n${args.body}\n`,
  });
