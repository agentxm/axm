/**
 * Local extension package fixtures for extension-type specifications.
 *
 * Writes minimal valid local packages — manifest plus canonical content —
 * under `<workspaceRoot>/vendor/<name>` for every extension type the root
 * locator install can acquire from a local directory. Returns the package
 * root for use as an install source, mirroring `writeLocalSkillPackage` in
 * `install-harness.ts`.
 */

import * as path from "node:path";

import { resolveSpecWorkspaceStorage, type SpecWorkspaceInput } from "./install-harness.js";

export interface LocalExtensionFixture {
  readonly name: string;
  readonly description?: string;
  readonly version?: string;
  readonly owner?: string;
}

const preparePackageRoot = (
  workspace: SpecWorkspaceInput,
  fixture: LocalExtensionFixture,
  manifestFilename: string,
  manifest: Readonly<Record<string, unknown>>,
): string => {
  const { root: workspaceRoot, files } = resolveSpecWorkspaceStorage(workspace);
  const packageRoot = path.join(workspaceRoot, "vendor", fixture.name);
  files.makeDirectory(path.join(packageRoot, "src"));
  files.writeFile(
    path.join(packageRoot, manifestFilename),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return packageRoot;
};

/** Writes a local rule package (`rule.json` plus `src/RULE.md`). */
export const writeLocalRulePackage = (
  workspace: SpecWorkspaceInput,
  fixture: LocalExtensionFixture,
): string => {
  const description = fixture.description ?? `The ${fixture.name} rule.`;
  const packageRoot = preparePackageRoot(workspace, fixture, "rule.json", {
    $schema: "https://axm.sh/schemas/rule.schema.json",
    owner: fixture.owner ?? "@acme",
    type: "rule",
    name: fixture.name,
    version: fixture.version ?? "1.0.0",
    description,
  });
  resolveSpecWorkspaceStorage(workspace).files.writeFile(
    path.join(packageRoot, "src", "RULE.md"),
    `Guidance for ${fixture.name}: ${description}\n`,
  );
  return packageRoot;
};

/** Writes a local hook package (`hook.json` plus `src/hook.sh`). */
export const writeLocalHookPackage = (
  workspace: SpecWorkspaceInput,
  fixture: LocalExtensionFixture,
): string => {
  const description = fixture.description ?? `The ${fixture.name} hook.`;
  const packageRoot = preparePackageRoot(workspace, fixture, "hook.json", {
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
  resolveSpecWorkspaceStorage(workspace).files.writeFile(
    path.join(packageRoot, "src", "hook.sh"),
    `#!/usr/bin/env bash\necho "${fixture.name}"\n`,
  );
  return packageRoot;
};

/** Writes a local OKF knowledge package (`knowledge.json` plus `src/index.md`). */
export const writeLocalKnowledgePackage = (
  workspace: SpecWorkspaceInput,
  fixture: LocalExtensionFixture,
): string => {
  const description = fixture.description ?? `The ${fixture.name} knowledge bundle.`;
  const packageRoot = preparePackageRoot(workspace, fixture, "knowledge.json", {
    $schema: "https://axm.sh/schemas/knowledge.schema.json",
    owner: fixture.owner ?? "@acme",
    type: "knowledge",
    name: fixture.name,
    version: fixture.version ?? "1.0.0",
    description,
    format: { name: "okf", version: "0.2" },
    bundleRoot: "src",
  });
  resolveSpecWorkspaceStorage(workspace).files.writeFile(
    path.join(packageRoot, "src", "index.md"),
    `---\nokf_version: "0.2"\ndescription: "${description}"\n---\n\n# ${fixture.name}\n`,
  );
  return packageRoot;
};

/** Writes a local subagent package (`subagent.json` plus `src/<name>.md`). */
export const writeLocalSubagentPackage = (
  workspace: SpecWorkspaceInput,
  fixture: LocalExtensionFixture,
): string => {
  const description = fixture.description ?? `The ${fixture.name} subagent.`;
  const packageRoot = preparePackageRoot(workspace, fixture, "subagent.json", {
    $schema: "https://axm.sh/schemas/subagent.schema.json",
    owner: fixture.owner ?? "@acme",
    type: "subagent",
    name: fixture.name,
    version: fixture.version ?? "1.0.0",
    description,
  });
  resolveSpecWorkspaceStorage(workspace).files.writeFile(
    path.join(packageRoot, "src", `${fixture.name}.md`),
    `---\nname: ${fixture.name}\ndescription: ${description}\n---\n\n# ${fixture.name}\n`,
  );
  return packageRoot;
};
