/** Workspace-authored publication fixtures shared by CLI tests. */
import * as fs from "node:fs";
import * as path from "node:path";

export interface AuthoredSkillFixture {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  /** Omit `src/SKILL.md` so the fixed publication gate rejects the skill. */
  readonly withSkillMd?: boolean;
  readonly publishExclude?: ReadonlyArray<string>;
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
      ...(fixture.publishExclude === undefined
        ? {}
        : { publish: { exclude: fixture.publishExclude } }),
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
      core: { instructions: `src/${fixture.name}.md` },
    },
    [[path.join("src", `${fixture.name}.md`), `# ${fixture.name}\n`]],
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
      implementations: ["claude-code", "codex"].map((protocol) => ({
        id: protocol,
        protocol,
        bindings: [
          {
            id: "audit",
            event: "PreToolUse",
            matcher: "Write|Edit",
            handler: { type: "command", runtime: "bash", entrypoint: "src/hook.sh" },
          },
        ],
      })),
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
