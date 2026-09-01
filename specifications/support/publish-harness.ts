/**
 * Publish fixtures for CLI specifications.
 *
 * Builds on `makeSpecWorkspace`: workspace-authored extension sources, a
 * file-based target registry whose uploads are directly observable on disk,
 * and the auth interaction layers the publish handler requires. The spec
 * workspace's default HttpClient fails every request, so a passing publish
 * specification is simultaneously evidence that the exercised path never
 * touched the network.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { AuthClientTest, DeviceLoginInteractionTest } from "@agentxm/registry-auth/testing";
import type { handleRootPublish } from "axm.sh/specification-harness";

import type { makeSpecWorkspace } from "./install-harness.js";

export type RootPublishArgs = Parameters<typeof handleRootPublish>[0];

export interface AuthoredSkillFixture {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  /** Omit `src/SKILL.md` so the fixed publication gate rejects the skill. */
  readonly withSkillMd?: boolean;
}

/**
 * Writes a workspace-authored skill under `<workspaceRoot>/skills/<name>`.
 * Pair with `settings: { skills: { [name]: "workspace" } }` on
 * `makeSpecWorkspace` so the workspace declares authorship of it.
 */
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
  if (fixture.withSkillMd !== false) {
    const description = fixture.description ?? `The ${fixture.name} skill.`;
    fs.writeFileSync(
      path.join(skillDir, "src", "SKILL.md"),
      `---\nname: ${fixture.name}\ndescription: ${description}\n---\n\n# ${fixture.name}\n\n${description}\n`,
    );
  }
};

export interface FileRegistry {
  /** `file://` URL for `--registry-url`. */
  readonly url: string;
  /** Every file the registry holds, relative to its root, sorted. */
  readonly storedFiles: () => readonly string[];
}

/**
 * Creates an empty file-based registry inside the workspace. Every upload a
 * publish performs lands as a file below the registry root, so an empty
 * `storedFiles()` after a command proves nothing was distributed.
 */
export const makeFileRegistry = (workspaceRoot: string): FileRegistry => {
  const registryRoot = path.join(workspaceRoot, "registry");
  fs.mkdirSync(registryRoot, { recursive: true });
  const walk = (directory: string): string[] =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? walk(entryPath)
        : [path.relative(registryRoot, entryPath).split(path.sep).join("/")];
    });
  return {
    url: pathToFileURL(registryRoot).href,
    storedFiles: () => walk(registryRoot).sort(),
  };
};

/**
 * The publish handler statically requires the auth client and device-login
 * interaction even for a local registry target; provide inert test layers on
 * top of the spec workspace layer.
 */
export const makePublishLayer = (workspace: Pick<ReturnType<typeof makeSpecWorkspace>, "layer">) =>
  Layer.mergeAll(workspace.layer, AuthClientTest(), DeviceLoginInteractionTest().layer);

/** Root publish handler args with non-interactive defaults for specifications. */
export const publishArgs = (
  registryUrl: string,
  overrides?: Partial<RootPublishArgs>,
): RootPublishArgs => ({
  selectors: [],
  owners: [],
  types: [],
  excludes: [],
  registry: Option.none(),
  registryUrl: Option.some(registryUrl),
  onExisting: Option.none(),
  backfill: false,
  yes: true,
  preview: true,
  scope: "project",
  visibility: Option.none(),
  includeDependencies: false,
  ...overrides,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Adds a workspace lint severity override to `axm.json`, the configurable
 * local lint policy that `axm lint` honors and the fixed publication gate
 * must ignore.
 */
export const setWorkspaceLintRule = (
  workspaceRoot: string,
  ruleId: string,
  severity: "off" | "info" | "warn" | "error",
): void => {
  const settingsPath = path.join(workspaceRoot, "axm.json");
  const settings: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  if (!isRecord(settings)) {
    throw new Error("Expected axm.json to contain a settings object");
  }
  fs.writeFileSync(
    settingsPath,
    JSON.stringify({ ...settings, lint: { rules: { [ruleId]: severity } } }),
  );
};
