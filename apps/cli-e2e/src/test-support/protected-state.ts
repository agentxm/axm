/**
 * Workspace state a built-CLI example declares protected, and a minimal
 * authored-workspace writer.
 *
 * An end-to-end project observes only shipped artifacts, so the protected-path
 * list and the settings and lockfile it writes are declared here rather than
 * imported from the application's own test support.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** The workspace state a preview of a workspace-changing command must not touch. */
export const WORKSPACE_PROTECTED_STATE: ReadonlyArray<string> = [
  "axm.json",
  "axm-lock.yaml",
  "agent_extensions",
  "skills",
  "subagents",
  "mcps",
  "rules",
  "hooks",
  "knowledge",
  "packs",
  ".claude",
  ".agents",
  ".cursor",
  ".codex",
  ".gemini",
  ".github",
  ".mcp.json",
  "AGENTS.md",
  "CLAUDE.md",
  ".gitignore",
];

export type ProtectedStateSnapshot = Readonly<Record<string, Readonly<Record<string, string>>>>;

const encodeBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

const snapshotDirectory = (root: string): Readonly<Record<string, string>> => {
  const entries: Array<readonly [string, string]> = [];
  const walk = (directory: string, relativeDirectory: string): void => {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const relative =
        relativeDirectory.length === 0 ? entry.name : `${relativeDirectory}/${entry.name}`;
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        entries.push([relative, `symlink:${fs.readlinkSync(target)}`]);
      } else if (entry.isDirectory()) {
        entries.push([relative, "directory"]);
        walk(target, relative);
      } else {
        entries.push([relative, `file:${encodeBase64(new Uint8Array(fs.readFileSync(target)))}`]);
      }
    }
  };
  walk(root, "");
  return Object.fromEntries(entries);
};

const snapshotPath = (absolute: string): Readonly<Record<string, string>> => {
  let entry: fs.Stats;
  try {
    entry = fs.lstatSync(absolute);
  } catch {
    return {};
  }
  if (entry.isSymbolicLink()) return { ".": `symlink:${fs.readlinkSync(absolute)}` };
  if (entry.isDirectory()) return snapshotDirectory(absolute);
  return { ".": `file:${encodeBase64(new Uint8Array(fs.readFileSync(absolute)))}` };
};

/** Exact content of every declared protected path, missing paths included as empty. */
export const snapshotProtectedState = (
  root: string,
  protectedPaths: ReadonlyArray<string> = WORKSPACE_PROTECTED_STATE,
): ProtectedStateSnapshot =>
  Object.fromEntries(
    protectedPaths.map((relative) => [relative, snapshotPath(path.join(root, relative))]),
  );

export interface WorkspaceStateOptions {
  readonly scope?: "project" | "user";
  readonly owner?: string;
  readonly agents?: ReadonlyArray<string>;
}

/**
 * Write an initialized workspace: settings naming the owner and configured
 * agents, and an empty v7 lockfile. `runtimeDir` is the project root, or the
 * application `.axm` directory when writing user scope.
 */
export const writeWorkspaceState = (
  runtimeDir: string,
  options: WorkspaceStateOptions = {},
): void => {
  const scope = options.scope ?? "project";
  const projectRoot = path.basename(runtimeDir) === ".axm" ? path.dirname(runtimeDir) : runtimeDir;
  const workspaceRoot = scope === "user" ? path.join(runtimeDir, "workspace") : projectRoot;
  fs.mkdirSync(path.join(workspaceRoot, ".axm"), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, "axm.json"),
    `${JSON.stringify(
      {
        agents: [...(options.agents ?? ["claude-code"])],
        ...(options.owner === undefined ? {} : { owner: options.owner }),
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(path.join(workspaceRoot, "axm-lock.yaml"), "lockfileVersion: 7\nskills: {}\n");
};

export interface AuthoredSkillFixture {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
}

/** Write a project-authored skill package under `skills/<name>`. */
export const writeAuthoredSkill = (workspaceRoot: string, fixture: AuthoredSkillFixture): void => {
  const skillDir = path.join(workspaceRoot, "skills", fixture.name);
  fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "skill.json"),
    JSON.stringify({
      owner: "@acme",
      type: "skill",
      name: fixture.name,
      version: fixture.version ?? "1.0.0",
    }),
  );
  const description = fixture.description ?? `The ${fixture.name} skill.`;
  fs.writeFileSync(
    path.join(skillDir, "src", "SKILL.md"),
    `---\nname: ${fixture.name}\ndescription: ${description}\n---\n\n# ${fixture.name}\n\n${description}\n`,
  );
};
