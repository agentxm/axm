/**
 * Minimal valid local extension packages, one per type an install can acquire
 * from a directory.
 *
 * Each writes the authoring slice's minimal package of its type — the manifest
 * and the canonical content the product itself requires, nothing simulated —
 * under `<root>/vendor/<name>`, and returns the package root so a
 * specification can hand it to an install as a source.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";

import { minimalPackageFiles, type MinimalPackageOptions } from "../authoring/testing.js";

/** What a local package fixture is called and how it identifies itself. */
type LocalPackageFixture = Omit<MinimalPackageOptions, "body" | "license">;

const writePackageFile = (packageRoot: string, relative: string, contents: string): void => {
  const file = nodePath.join(packageRoot, relative);
  fs.mkdirSync(nodePath.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
};

/**
 * Write the minimal valid package of `type` into `packageRoot`, plus any
 * `extraFiles` an example places beside it, and return `packageRoot`.
 */
export const writeMinimalPackage = (
  packageRoot: string,
  type: ExtensionType,
  options: MinimalPackageOptions,
  extraFiles: Readonly<Record<string, string>> = {},
): string => {
  fs.mkdirSync(packageRoot, { recursive: true });
  for (const [relative, contents] of Object.entries({
    ...minimalPackageFiles(type, options),
    ...extraFiles,
  }))
    writePackageFile(packageRoot, relative, contents);
  return packageRoot;
};

const writeLocalPackage =
  (type: ExtensionType) =>
  (root: string, fixture: LocalPackageFixture): string =>
    writeMinimalPackage(nodePath.join(root, "vendor", fixture.name), type, fixture);

/** A local skill package: `skill.json` plus `src/SKILL.md`. */
export const writeLocalSkillPackage = writeLocalPackage("skill");

/**
 * A bare Agent Skill directory: one root `SKILL.md` carrying the frontmatter
 * the Agent Skill format requires, with no `skill.json` and no `src/`. It is
 * the other entry-document layout a Skill source can arrive in.
 */
export const writeAgentSkillDirectory = (root: string, fixture: LocalPackageFixture): string => {
  const packageRoot = nodePath.join(root, "vendor", fixture.name);
  const skillDocument = minimalPackageFiles("skill", fixture)["src/SKILL.md"] ?? "";
  writePackageFile(packageRoot, "SKILL.md", skillDocument);
  return packageRoot;
};

/** A local portable subagent package with an explicit instruction source. */
export const writeLocalSubagentPackage = writeLocalPackage("subagent");

/** A local rule package: `rule.json` plus `src/RULE.md`. */
export const writeLocalRulePackage = writeLocalPackage("rule");

/** A local hook extension: `hook.json` plus `src/hook.sh`. */
export const writeLocalHookPackage = writeLocalPackage("hook");

/** A local Open Knowledge Format bundle: `knowledge.json` plus `src/index.md`. */
export const writeLocalKnowledgePackage = writeLocalPackage("knowledge");
