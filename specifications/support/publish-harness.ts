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
import * as Effect from "effect/Effect";

import { AuthClientTest, DeviceLoginInteractionTest } from "@agentxm/registry-auth/testing";
import {
  GitDirectoryComparison,
  type GitDirectoryComparisonService,
  type handleRootPublish,
} from "axm.sh/specification-harness";

import type { makeSpecWorkspace } from "./install-harness.js";

export type RootPublishArgs = Parameters<typeof handleRootPublish>[0];

export interface AuthoredSkillFixture {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  /** Omit `src/SKILL.md` so the fixed publication gate rejects the skill. */
  readonly withSkillMd?: boolean;
  readonly publishIgnore?: ReadonlyArray<string>;
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
      ...(fixture.publishIgnore === undefined
        ? {}
        : { publish: { ignore: fixture.publishIgnore } }),
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

export interface AuthoredExtensionFixture {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
}

const writeAuthoredPackage = (
  workspaceRoot: string,
  authoredDirectory: string,
  name: string,
  manifestFilename: string,
  manifest: Readonly<Record<string, unknown>>,
  content: ReadonlyArray<readonly [relativePath: string, text: string]>,
): void => {
  const packageDir = path.join(workspaceRoot, authoredDirectory, name);
  fs.mkdirSync(path.join(packageDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, manifestFilename),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  for (const [relativePath, text] of content) {
    fs.writeFileSync(path.join(packageDir, relativePath), text);
  }
};

/**
 * Writes a workspace-authored MCP server package under
 * `<workspaceRoot>/mcps/<name>`. Pair with `settings: { mcps: { [name]: "workspace" } }`.
 */
export const writeAuthoredMcpServer = (
  workspaceRoot: string,
  fixture: AuthoredExtensionFixture,
): void => {
  const version = fixture.version ?? "1.0.0";
  writeAuthoredPackage(
    workspaceRoot,
    "mcps",
    fixture.name,
    "mcp.json",
    {
      owner: "@acme",
      type: "mcp-server",
      name: fixture.name,
      version,
      description: fixture.description ?? `The ${fixture.name} MCP server.`,
      server: {
        name: `ai.agentxm.spec/${fixture.name}`,
        description: fixture.description ?? `The ${fixture.name} MCP server.`,
        version,
        packages: [
          {
            registryType: "npm",
            identifier: `@acme/${fixture.name}`,
            version,
            transport: { type: "stdio" },
          },
        ],
      },
    },
    [],
  );
};

/**
 * Writes a workspace-authored subagent package under
 * `<workspaceRoot>/subagents/<name>`. Pair with `settings: { subagents: { [name]: "workspace" } }`.
 */
export const writeAuthoredSubagent = (
  workspaceRoot: string,
  fixture: AuthoredExtensionFixture,
): void => {
  const description = fixture.description ?? `The ${fixture.name} subagent.`;
  writeAuthoredPackage(
    workspaceRoot,
    "subagents",
    fixture.name,
    "subagent.json",
    {
      owner: "@acme",
      type: "subagent",
      name: fixture.name,
      version: fixture.version ?? "1.0.0",
      description,
    },
    [
      [
        path.join("src", `${fixture.name}.md`),
        `---\nname: ${fixture.name}\ndescription: ${description}\n---\n\n# ${fixture.name}\n`,
      ],
    ],
  );
};

/**
 * Writes a workspace-authored hook package under `<workspaceRoot>/hooks/<name>`.
 * Pair with `settings: { hooks: { [name]: "workspace" } }`.
 */
export const writeAuthoredHook = (
  workspaceRoot: string,
  fixture: AuthoredExtensionFixture,
): void => {
  writeAuthoredPackage(
    workspaceRoot,
    "hooks",
    fixture.name,
    "hook.json",
    {
      owner: "@acme",
      type: "hook",
      name: fixture.name,
      version: fixture.version ?? "1.0.0",
      description: fixture.description ?? `The ${fixture.name} hook.`,
      runtime: "bash",
      entrypoint: "src/hook.sh",
      bindings: [{ on: "tool.pre", match: { tools: ["file.write"] } }],
    },
    [[path.join("src", "hook.sh"), `#!/usr/bin/env bash\necho "${fixture.name}"\n`]],
  );
};

/**
 * Writes a workspace-authored rule package under `<workspaceRoot>/rules/<name>`.
 * Pair with `settings: { rules: { [name]: "workspace" } }`.
 */
export const writeAuthoredRule = (
  workspaceRoot: string,
  fixture: AuthoredExtensionFixture,
): void => {
  const description = fixture.description ?? `The ${fixture.name} rule.`;
  writeAuthoredPackage(
    workspaceRoot,
    "rules",
    fixture.name,
    "rule.json",
    {
      owner: "@acme",
      type: "rule",
      name: fixture.name,
      version: fixture.version ?? "1.0.0",
      description,
    },
    [[path.join("src", "RULE.md"), `Guidance for ${fixture.name}: ${description}\n`]],
  );
};

/**
 * Writes a workspace-authored OKF knowledge bundle under
 * `<workspaceRoot>/knowledge/<name>`. Pair with `settings: { knowledge: { [name]: "workspace" } }`.
 */
export const writeAuthoredKnowledge = (
  workspaceRoot: string,
  fixture: AuthoredExtensionFixture,
): void => {
  const description = fixture.description ?? `The ${fixture.name} knowledge bundle.`;
  writeAuthoredPackage(
    workspaceRoot,
    "knowledge",
    fixture.name,
    "knowledge.json",
    {
      owner: "@acme",
      type: "knowledge",
      name: fixture.name,
      version: fixture.version ?? "1.0.0",
      description,
      format: { name: "okf", version: "0.2" },
      bundleRoot: "src",
    },
    [
      [
        path.join("src", "index.md"),
        `---\nokf_version: "0.2"\ndescription: "${description}"\n---\n\n# ${fixture.name}\n`,
      ],
    ],
  );
};

export interface AuthoredPackFixture extends AuthoredExtensionFixture {
  /** Member constraints keyed by extension FQN; defaults to an empty pack. */
  readonly dependencies?: Readonly<Record<string, string>>;
}

/**
 * Writes a workspace-authored pack manifest under `<workspaceRoot>/packs/<name>`.
 * Pair with `settings: { packs: { [name]: "workspace" } }`.
 */
export const writeAuthoredPack = (workspaceRoot: string, fixture: AuthoredPackFixture): void => {
  const packDir = path.join(workspaceRoot, "packs", fixture.name);
  fs.mkdirSync(packDir, { recursive: true });
  fs.writeFileSync(
    path.join(packDir, "pack.json"),
    `${JSON.stringify(
      {
        owner: "@acme",
        type: "pack",
        name: fixture.name,
        version: fixture.version ?? "1.0.0",
        description: fixture.description ?? `The ${fixture.name} pack.`,
        dependencies: fixture.dependencies ?? {},
      },
      null,
      2,
    )}\n`,
  );
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
export const makePublishLayer = (
  workspace: Pick<ReturnType<typeof makeSpecWorkspace>, "layer">,
  compare: GitDirectoryComparisonService["compare"] = () => Effect.succeed(Option.none()),
) =>
  Layer.mergeAll(
    workspace.layer,
    AuthClientTest(),
    DeviceLoginInteractionTest().layer,
    Layer.succeed(GitDirectoryComparison, { compare }),
  );

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
  acceptWarnings: false,
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
