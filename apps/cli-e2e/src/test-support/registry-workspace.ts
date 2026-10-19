/**
 * Workspaces that resolve against a controlled Registry, and fixture content
 * published through the built CLI into one.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

import { createTempDir, runCli } from "../e2e/utils.js";

const registryEnv = (): Record<string, string> => ({ AXM_TOKEN: "e2e-test-token" });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export interface RegistryWorkspaceOptions {
  /** The directory `axm setup` runs in. */
  readonly path: string;
  /** The Registry location every source resolves against. */
  readonly location: string;
  readonly owner: string;
  /** Defaults to `project`. A `user` scope reads its home from `env.AXM_USER_HOME`. */
  readonly scope?: "project" | "user";
  /** The agents setup configures. Defaults to `claude-code`. */
  readonly agents?: ReadonlyArray<string>;
  /** The process environment setup runs with. Defaults to a Registry token. */
  readonly env?: Readonly<Record<string, string>>;
  /**
   * Set where a scenario installs releases published moments earlier, which
   * the default release-age window would otherwise hold back.
   */
  readonly minimumReleaseAge?: string;
}

const settingsPathFor = (options: RegistryWorkspaceOptions): string => {
  if (options.scope !== "user") return path.join(options.path, "axm.json");
  const home = options.env?.["AXM_USER_HOME"];
  if (home === undefined) throw new Error("A user-scope workspace needs AXM_USER_HOME in its env");
  return path.join(home, ".axm", "workspace", "axm.json");
};

/**
 * Set a scope up and select the controlled Registry as its default source.
 * Returns the settings it wrote so a scenario can add its own entries.
 */
export const initRegistryWorkspace = async (options: RegistryWorkspaceOptions) => {
  const scope = options.scope ?? "project";
  const agents = (options.agents ?? ["claude-code"]).flatMap((agent) => ["--agent", agent]);
  const setup = await runCli(["setup", "--yes", "--scope", scope, ...agents], {
    cwd: options.path,
    env: { ...(options.env ?? registryEnv()) },
  });
  // A setup that died leaves no settings, and the read below would surface
  // that as a missing file with setup's own output already discarded.
  expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
  const settingsPath = settingsPathFor(options);
  const existing: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  if (!isRecord(existing)) throw new Error("Expected workspace settings object");
  const settings: Record<string, unknown> = {
    ...existing,
    defaultRegistry: "test",
    sources: [{ name: "test", type: "registry", location: options.location }],
    owner: options.owner,
    ...(options.minimumReleaseAge === undefined
      ? {}
      : { minimumReleaseAge: options.minimumReleaseAge }),
  };
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return { settingsPath, settings };
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
    await initRegistryWorkspace({
      path: workspace.path,
      location: args.registryLocation,
      owner: args.owner,
      minimumReleaseAge: "0s",
    });
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
