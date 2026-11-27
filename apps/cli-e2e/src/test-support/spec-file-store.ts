/**
 * Local-package fixtures for end-to-end specifications. A built-CLI
 * specification writes to the real disk the spawned process reads.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface LocalSkillFixture {
  readonly name: string;
  readonly description?: string;
  readonly version?: string;
  readonly owner?: string;
  readonly body?: string;
}

/**
 * Writes a local skill package (manifest plus `src/SKILL.md`) under
 * `<workspaceRoot>/vendor/<name>` and returns its absolute path for use as an
 * install source.
 */
export const writeLocalSkillPackage = (
  workspaceRoot: string,
  fixture: LocalSkillFixture,
): string => {
  const packageRoot = path.join(workspaceRoot, "vendor", fixture.name);
  fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  const description = fixture.description ?? `The ${fixture.name} skill.`;
  fs.writeFileSync(
    path.join(packageRoot, "skill.json"),
    `${JSON.stringify(
      {
        $schema: "https://axm.sh/schemas/skill.schema.json",
        owner: fixture.owner ?? "@acme",
        type: "skill",
        name: fixture.name,
        version: fixture.version ?? "1.0.0",
        description,
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(packageRoot, "src", "SKILL.md"),
    `---\nname: "${fixture.name}"\ndescription: "${description}"\n---\n\n# ${fixture.name}\n\n${fixture.body ?? description}\n`,
  );
  return packageRoot;
};
