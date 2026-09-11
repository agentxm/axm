/** Complete local packages shared by authoring transition specifications. */
import * as fs from "node:fs";
import * as path from "node:path";
import { writeLocalSkillPackage } from "./install-harness.js";
import {
  writeLocalHookPackage,
  writeLocalKnowledgePackage,
  writeLocalRulePackage,
  writeLocalSubagentPackage,
} from "./extension-fixtures.js";

export const authoringTypes = [
  {
    type: "skill",
    plural: "skills",
    settingsKey: "skills",
    inputKey: "skills",
    manifest: "skill.json",
  },
  {
    type: "subagent",
    plural: "subagents",
    settingsKey: "subagents",
    inputKey: "subagents",
    manifest: "subagent.json",
  },
  {
    type: "mcp-server",
    plural: "mcps",
    settingsKey: "mcpServers",
    inputKey: "mcps",
    manifest: "mcp.json",
  },
  { type: "rule", plural: "rules", settingsKey: "rules", inputKey: "rules", manifest: "rule.json" },
  { type: "hook", plural: "hooks", settingsKey: "hooks", inputKey: "hooks", manifest: "hook.json" },
  {
    type: "knowledge",
    plural: "knowledge",
    settingsKey: "knowledge",
    inputKey: "knowledge",
    manifest: "knowledge.json",
  },
  { type: "pack", plural: "packs", settingsKey: "packs", inputKey: "packs", manifest: "pack.json" },
] as const;
export type AuthoringType = (typeof authoringTypes)[number];

export const writePackageFile = (root: string, relative: string, content: string): void => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
export const readPackageJson = (root: string, relative: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));

export const writeAuthoringPackage = (
  root: string,
  row: AuthoringType,
  name: string,
  options: { readonly parent?: string; readonly version?: string; readonly owner?: string } = {},
): string => {
  const fixture = { name, version: options.version ?? "1.2.3", owner: options.owner ?? "@acme" };
  let source: string;
  switch (row.type) {
    case "skill":
      source = writeLocalSkillPackage(root, fixture);
      break;
    case "subagent":
      source = writeLocalSubagentPackage(root, fixture);
      break;
    case "rule":
      source = writeLocalRulePackage(root, fixture);
      break;
    case "hook":
      source = writeLocalHookPackage(root, fixture);
      break;
    case "knowledge":
      source = writeLocalKnowledgePackage(root, fixture);
      break;
    case "mcp-server":
    case "pack": {
      source = path.join(root, "vendor", name);
      const extra =
        row.type === "pack"
          ? { dependencies: {} }
          : {
              server: {
                name: `ai.agentxm.spec/${name}`,
                description: `The ${name} server.`,
                version: fixture.version,
                packages: [
                  {
                    registryType: "npm",
                    identifier: `@acme/${name}`,
                    version: fixture.version,
                    transport: { type: "stdio" },
                  },
                ],
              },
            };
      writePackageFile(
        source,
        row.manifest,
        `${JSON.stringify({ ...fixture, type: row.type, ...extra }, null, 2)}\n`,
      );
      break;
    }
  }
  const manifest = readPackageJson(source, row.manifest);
  if (typeof manifest !== "object" || manifest === null)
    throw new Error("Expected package manifest");
  writePackageFile(
    source,
    row.manifest,
    `${JSON.stringify({ ...manifest, license: "MIT" }, null, 2)}\n`,
  );
  if (row.type === "subagent") {
    const document = path.join(source, "src", `${name}.md`);
    fs.writeFileSync(
      document,
      fs.readFileSync(document, "utf8").replace(`name: ${name}\n`, `name: ${name}\nmodel: fast\n`),
    );
  }
  writePackageFile(source, "notes.txt", "Author notes preserved across the operation.\n");
  if (options.parent === undefined) return source;
  const destination = path.join(root, options.parent, name);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.renameSync(source, destination);
  return destination;
};
