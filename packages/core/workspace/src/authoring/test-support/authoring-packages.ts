/**
 * Complete, valid packages of every extension type, written into a real
 * directory.
 *
 * Fork, adoption, and native import all read content a person already has, so
 * their specifications need real packages on disk rather than doubles: a
 * manifest the content schemas accept plus the canonical body each type
 * carries, and one extra file whose bytes prove the operation copied or moved
 * the whole package rather than a manifest.
 *
 * @internal Test-only. Not part of the package's public API.
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

/** The seven types, with the names their settings and manifests use. */
export const authoringTypes = [
  {
    type: "skill",
    plural: "skills",
    settingsKey: "skills",
    manifest: "skill.json",
  },
  {
    type: "subagent",
    plural: "subagents",
    settingsKey: "subagents",
    manifest: "subagent.json",
  },
  {
    type: "mcp-server",
    plural: "mcps",
    settingsKey: "mcpServers",
    manifest: "mcp.json",
  },
  { type: "rule", plural: "rules", settingsKey: "rules", manifest: "rule.json" },
  { type: "hook", plural: "hooks", settingsKey: "hooks", manifest: "hook.json" },
  {
    type: "knowledge",
    plural: "knowledge",
    settingsKey: "knowledge",
    manifest: "knowledge.json",
  },
  { type: "pack", plural: "packs", settingsKey: "packs", manifest: "pack.json" },
] as const;

export type AuthoringType = (typeof authoringTypes)[number];

/** The row for one extension type. */
export const authoringTypeFor = (type: AuthoringType["type"]): AuthoringType => {
  const row = authoringTypes.find((candidate) => candidate.type === type);
  if (row === undefined) throw new Error(`No authoring row for ${type}`);
  return row;
};

const writeFileAt = (target: string, contents: string): void => {
  fs.mkdirSync(nodePath.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
};

interface PackageFixture {
  readonly name: string;
  readonly owner: string;
  readonly version: string;
  readonly description: string;
}

const manifestFor = (
  row: AuthoringType,
  fixture: PackageFixture,
): Readonly<Record<string, unknown>> => {
  const base = {
    $schema: `https://axm.sh/schemas/${row.type === "mcp-server" ? "mcp" : row.type}.schema.json`,
    owner: fixture.owner,
    type: row.type,
    name: fixture.name,
    version: fixture.version,
    description: fixture.description,
    license: "MIT",
  };
  switch (row.type) {
    case "hook":
      return {
        ...base,
        runtime: "bash",
        entrypoint: "src/hook.sh",
        bindings: [{ on: "tool.pre", match: { tools: ["file.write"] } }],
      };
    case "knowledge":
      return { ...base, format: { name: "okf", version: "0.2" }, bundleRoot: "src" };
    case "pack":
      return { ...base, dependencies: {} };
    case "mcp-server":
      return {
        ...base,
        server: {
          name: `ai.agentxm.spec/${fixture.name}`,
          description: fixture.description,
          version: fixture.version,
          packages: [
            {
              registryType: "npm",
              identifier: `@acme/${fixture.name}`,
              version: fixture.version,
              transport: { type: "stdio" },
            },
          ],
        },
      };
    default:
      return base;
  }
};

const writeBody = (row: AuthoringType, packageRoot: string, fixture: PackageFixture): void => {
  switch (row.type) {
    case "skill":
      writeFileAt(
        nodePath.join(packageRoot, "src", "SKILL.md"),
        `---\nname: "${fixture.name}"\ndescription: "${fixture.description}"\n---\n\n# ${fixture.name}\n\n${fixture.description}\n`,
      );
      return;
    case "subagent":
      writeFileAt(
        nodePath.join(packageRoot, "src", `${fixture.name}.md`),
        `---\nname: ${fixture.name}\nmodel: fast\ndescription: ${fixture.description}\n---\n\n# ${fixture.name}\n`,
      );
      return;
    case "rule":
      writeFileAt(
        nodePath.join(packageRoot, "src", "RULE.md"),
        `Guidance for ${fixture.name}: ${fixture.description}\n`,
      );
      return;
    case "hook":
      writeFileAt(
        nodePath.join(packageRoot, "src", "hook.sh"),
        `#!/usr/bin/env bash\necho "${fixture.name}"\n`,
      );
      return;
    case "knowledge":
      writeFileAt(
        nodePath.join(packageRoot, "src", "index.md"),
        `---\nokf_version: "0.2"\ndescription: "${fixture.description}"\n---\n\n# ${fixture.name}\n`,
      );
      return;
    case "mcp-server":
    case "pack":
      return;
  }
};

/**
 * Write a complete package of one type under `root`.
 *
 * By default it lands in `vendor/<name>`, the shape a fork or import reads
 * from; `parent` relocates it, which is how an adoption's acquired copy is
 * placed under the workspace's own acquired root.
 */
export const writeAuthoringPackage = (
  root: string,
  row: AuthoringType,
  name: string,
  options: {
    readonly parent?: string;
    readonly version?: string;
    readonly owner?: string;
    readonly description?: string;
  } = {},
): string => {
  const fixture: PackageFixture = {
    name,
    owner: options.owner ?? "@acme",
    version: options.version ?? "1.2.3",
    description: options.description ?? `The ${name} ${row.type}.`,
  };
  const packageRoot = nodePath.join(root, options.parent ?? "vendor", name);
  fs.mkdirSync(packageRoot, { recursive: true });
  writeFileAt(
    nodePath.join(packageRoot, row.manifest),
    `${JSON.stringify(manifestFor(row, fixture), null, 2)}\n`,
  );
  writeBody(row, packageRoot, fixture);
  writeFileAt(
    nodePath.join(packageRoot, "notes.txt"),
    "Author notes preserved across the operation.\n",
  );
  return packageRoot;
};
