import { copyFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EXPECTED_CONTENT_ASSETS, validateReleaseContentAssets } from "./release-checksums.js";

export const RELEASE_CONTENT_ARTIFACT_PREFIX = "axm-release-content";

export const RELEASE_CONTENT_SOURCES = {
  "install.sh": "apps/cli/site-content/install.sh",
  "install.ps1": "apps/cli/site-content/install.ps1",
  "install.cmd": "apps/cli/site-content/install.cmd",
  "install.md": "apps/cli/site-content/install.md",
  "axm-lock.schema.json": "apps/cli/site-content/__generated__/schemas/axm-lock.schema.json",
  "axm-package-meta.schema.json":
    "apps/cli/site-content/__generated__/schemas/axm-package-meta.schema.json",
  "hook.schema.json": "apps/cli/site-content/__generated__/schemas/hook.schema.json",
  "knowledge.schema.json": "apps/cli/site-content/__generated__/schemas/knowledge.schema.json",
  "mcp.schema.json": "apps/cli/site-content/__generated__/schemas/mcp.schema.json",
  "pack.schema.json": "apps/cli/site-content/__generated__/schemas/pack.schema.json",
  "rule.schema.json": "apps/cli/site-content/__generated__/schemas/rule.schema.json",
  "settings.schema.json": "apps/cli/site-content/__generated__/schemas/settings.schema.json",
  "skill.schema.json": "apps/cli/site-content/__generated__/schemas/skill.schema.json",
  "subagent.schema.json": "apps/cli/site-content/__generated__/schemas/subagent.schema.json",
} satisfies Readonly<Record<(typeof EXPECTED_CONTENT_ASSETS)[number], string>>;

export const releaseContentArtifactName = (sha: string): string =>
  `${RELEASE_CONTENT_ARTIFACT_PREFIX}-${sha}`;

export const produceReleaseContent = (sourceRoot: string, outputDirectory: string): void => {
  mkdirSync(outputDirectory, { recursive: true });
  for (const name of EXPECTED_CONTENT_ASSETS) {
    copyFileSync(join(sourceRoot, RELEASE_CONTENT_SOURCES[name]), join(outputDirectory, name));
  }
  validateReleaseContentAssets(outputDirectory);
};

const entryPath = process.argv[1];
if (entryPath !== undefined && resolve(entryPath) === resolve(fileURLToPath(import.meta.url))) {
  const outputDirectory = process.argv[2];
  if (outputDirectory === undefined) {
    throw new Error("Usage: release-content.ts <output-directory>");
  }
  const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  produceReleaseContent(repositoryRoot, resolve(outputDirectory));
  console.log(
    `Produced ${String(EXPECTED_CONTENT_ASSETS.length)} release content assets in ${resolve(outputDirectory)}`,
  );
}
