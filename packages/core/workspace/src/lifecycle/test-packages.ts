/**
 * Minimal valid local extension packages, one per type an install can acquire
 * from a directory.
 *
 * Each writes the manifest and the canonical content the product itself
 * requires — nothing simulated — under `<root>/vendor/<name>`, and returns the
 * package root so a specification can hand it to an install as a source.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

/** What a local package fixture is called and how it identifies itself. */
export interface LocalPackageFixture {
  readonly name: string;
  readonly description?: string;
  readonly version?: string;
  readonly owner?: string;
}

const writePackageFile = (packageRoot: string, relative: string, contents: string): void => {
  const file = nodePath.join(packageRoot, relative);
  fs.mkdirSync(nodePath.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
};

const preparePackageRoot = (
  root: string,
  fixture: LocalPackageFixture,
  manifestFilename: string,
  manifest: Readonly<Record<string, unknown>>,
): string => {
  const packageRoot = nodePath.join(root, "vendor", fixture.name);
  fs.mkdirSync(nodePath.join(packageRoot, "src"), { recursive: true });
  writePackageFile(packageRoot, manifestFilename, `${JSON.stringify(manifest, null, 2)}\n`);
  return packageRoot;
};

/** A local skill package: `skill.json` plus `src/SKILL.md`. */
export const writeLocalSkillPackage = (root: string, fixture: LocalPackageFixture): string => {
  const description = fixture.description ?? `The ${fixture.name} skill.`;
  const packageRoot = preparePackageRoot(root, fixture, "skill.json", {
    $schema: "https://axm.sh/schemas/skill.schema.json",
    owner: fixture.owner ?? "@acme",
    type: "skill",
    name: fixture.name,
    version: fixture.version ?? "1.0.0",
    description,
  });
  writePackageFile(
    packageRoot,
    "src/SKILL.md",
    `---\nname: "${fixture.name}"\ndescription: "${description}"\n---\n\n# ${fixture.name}\n\n${description}\n`,
  );
  return packageRoot;
};

/**
 * A bare Agent Skill directory: one root `SKILL.md` carrying the frontmatter
 * the Agent Skill format requires, with no `skill.json` and no `src/`. It is
 * the other entry-document layout a Skill source can arrive in.
 */
export const writeAgentSkillDirectory = (root: string, fixture: LocalPackageFixture): string => {
  const description = fixture.description ?? `The ${fixture.name} skill.`;
  const packageRoot = nodePath.join(root, "vendor", fixture.name);
  fs.mkdirSync(packageRoot, { recursive: true });
  writePackageFile(
    packageRoot,
    "SKILL.md",
    `---\nname: "${fixture.name}"\ndescription: "${description}"\n---\n\n# ${fixture.name}\n\n${description}\n`,
  );
  return packageRoot;
};

/** A local subagent package: `subagent.json` plus `src/<name>.md`. */
export const writeLocalSubagentPackage = (root: string, fixture: LocalPackageFixture): string => {
  const description = fixture.description ?? `The ${fixture.name} subagent.`;
  const packageRoot = preparePackageRoot(root, fixture, "subagent.json", {
    $schema: "https://axm.sh/schemas/subagent.schema.json",
    owner: fixture.owner ?? "@acme",
    type: "subagent",
    name: fixture.name,
    version: fixture.version ?? "1.0.0",
    description,
  });
  writePackageFile(
    packageRoot,
    `src/${fixture.name}.md`,
    `---\nname: ${fixture.name}\ndescription: ${description}\n---\n\n# ${fixture.name}\n`,
  );
  return packageRoot;
};

/** A local rule package: `rule.json` plus `src/RULE.md`. */
export const writeLocalRulePackage = (root: string, fixture: LocalPackageFixture): string => {
  const description = fixture.description ?? `The ${fixture.name} rule.`;
  const packageRoot = preparePackageRoot(root, fixture, "rule.json", {
    $schema: "https://axm.sh/schemas/rule.schema.json",
    owner: fixture.owner ?? "@acme",
    type: "rule",
    name: fixture.name,
    version: fixture.version ?? "1.0.0",
    description,
  });
  writePackageFile(packageRoot, "src/RULE.md", `Guidance for ${fixture.name}: ${description}\n`);
  return packageRoot;
};

/** A local hooks package: `hook.json` plus `src/hook.sh`. */
export const writeLocalHookPackage = (root: string, fixture: LocalPackageFixture): string => {
  const description = fixture.description ?? `The ${fixture.name} hook.`;
  const packageRoot = preparePackageRoot(root, fixture, "hook.json", {
    $schema: "https://axm.sh/schemas/hook.schema.json",
    owner: fixture.owner ?? "@acme",
    type: "hook",
    name: fixture.name,
    version: fixture.version ?? "1.0.0",
    description,
    runtime: "bash",
    entrypoint: "src/hook.sh",
    bindings: [{ on: "tool.pre", match: { tools: ["file.write"] } }],
  });
  writePackageFile(packageRoot, "src/hook.sh", `#!/usr/bin/env bash\necho "${fixture.name}"\n`);
  return packageRoot;
};

/** A local Open Knowledge Format bundle: `knowledge.json` plus `src/index.md`. */
export const writeLocalKnowledgePackage = (root: string, fixture: LocalPackageFixture): string => {
  const description = fixture.description ?? `The ${fixture.name} knowledge bundle.`;
  const packageRoot = preparePackageRoot(root, fixture, "knowledge.json", {
    $schema: "https://axm.sh/schemas/knowledge.schema.json",
    owner: fixture.owner ?? "@acme",
    type: "knowledge",
    name: fixture.name,
    version: fixture.version ?? "1.0.0",
    description,
    format: { name: "okf", version: "0.2" },
    bundleRoot: "src",
  });
  writePackageFile(
    packageRoot,
    "src/index.md",
    `---\nokf_version: "0.2"\ndescription: "${description}"\n---\n\n# ${fixture.name}\n`,
  );
  return packageRoot;
};
