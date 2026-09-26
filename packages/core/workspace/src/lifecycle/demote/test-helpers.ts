/**
 * Complete local packages for the authoring transitions this package owns.
 *
 * Demotion replaces workspace authorship with an external source, so its
 * examples need a package of every authored type — written the way the
 * product writes one — in both the authored location (`<root>/<plural>/<name>`)
 * and as a replacement source under `<root>/vendor/<name>`.
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import { unzipSync } from "fflate";

import { previewPlanExecution } from "../../transitions/planning/index.js";
import { preapprovedPlanExecution } from "../../transitions/planning/testing.js";

import {
  writeLocalHookPackage,
  writeLocalKnowledgePackage,
  writeLocalRulePackage,
  writeLocalSkillPackage,
  writeLocalSubagentPackage,
} from "../test-packages.js";
import { DemoteToExternalSource, type DemoteRequest } from "./demote-to-external-source.js";

/** One authored extension type, and how the workspace spells it everywhere. */
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

export const writePackageFile = (root: string, relative: string, content: string): void => {
  const target = nodePath.join(root, relative);
  fs.mkdirSync(nodePath.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};

export const readPackageJson = (root: string, relative: string): unknown =>
  JSON.parse(fs.readFileSync(nodePath.join(root, relative), "utf8"));

/**
 * Write a complete package of one authored type. Without `parent` it lands
 * under `vendor/<name>` as an external source; with it, under the authored
 * root the workspace owns.
 */
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
      source = nodePath.join(root, "vendor", name);
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
  if (typeof manifest !== "object" || manifest === null) {
    throw new Error("Expected package manifest");
  }
  writePackageFile(
    source,
    row.manifest,
    `${JSON.stringify({ ...manifest, license: "MIT" }, null, 2)}\n`,
  );
  if (row.type === "subagent") {
    const document = nodePath.join(source, "src", `${name}.md`);
    fs.writeFileSync(
      document,
      fs.readFileSync(document, "utf8").replace(`name: ${name}\n`, `name: ${name}\nmodel: fast\n`),
    );
  }
  writePackageFile(source, "notes.txt", "Author notes preserved across the operation.\n");
  if (options.parent === undefined) return source;
  const destination = nodePath.join(root, options.parent, name);
  fs.mkdirSync(nodePath.dirname(destination), { recursive: true });
  fs.renameSync(source, destination);
  return destination;
};

/**
 * Expand a published version archive into a directory, so an example can
 * compare realized canonical content against the bytes the Registry serves
 * without shelling out to an archiver.
 */
export const extractArchive = (archivePath: string, destination: string): string => {
  const files = unzipSync(fs.readFileSync(archivePath));
  for (const [relative, bytes] of Object.entries(files)) {
    if (relative.endsWith("/")) continue;
    const target = nodePath.join(destination, relative);
    fs.mkdirSync(nodePath.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  return destination;
};

/** Settle a demotion and preview it: nothing is written. */
export const previewDemote = (request: DemoteRequest) =>
  Effect.gen(function* () {
    const candidate = yield* DemoteToExternalSource.prepare(request);
    return yield* DemoteToExternalSource.previewOrApply(candidate, previewPlanExecution);
  });

/** Settle a demotion and apply it. */
export const applyDemote = (request: DemoteRequest) =>
  Effect.gen(function* () {
    const candidate = yield* DemoteToExternalSource.prepare(request);
    return yield* DemoteToExternalSource.previewOrApply(candidate, preapprovedPlanExecution);
  });
