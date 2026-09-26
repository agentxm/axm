/**
 * Workspace state and authored-skill writers for built-CLI examples.
 *
 * An end-to-end project observes only shipped artifacts. These writers create
 * the settings and lockfile fixtures independently of the application's test support.
 */

import * as fs from "node:fs";
import * as path from "node:path";

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
  fs.writeFileSync(path.join(workspaceRoot, "axm-lock.yaml"), "lockfileVersion: 8\nskills: {}\n");
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
