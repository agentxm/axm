import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import {
  EXTENSION_TYPE_MATRIX,
  type ExtensionTypeMatrixRow,
  type MatrixExtensionType,
} from "./__generated__/extension-type-matrix.js";
import { createTempDir, runCli } from "./e2e/utils.js";
import { refreshAuthoredWorkspacePackState } from "./e2e/workspace-pack-state.js";

const OWNER = "@test";
const PUBLISH_ENV = { AXM_TOKEN: "e2e-test-token" };

/**
 * Install surfaces come from the generated extension-type matrix, so the suite
 * has a row per extension type whether or not that type is covered yet. A new
 * type appears here as a new row and has to be answered for — either with a
 * publisher below or with a ledger row naming the obligation it is missing.
 */
type InstallSurface = ExtensionTypeMatrixRow["plural"];
type SettingsKey = Exclude<InstallSurface, "mcps"> | "mcpServers";

type Publisher = (
  registryPath: string,
  name: string,
  options?: PackPublishOptions,
) => Promise<void>;

interface PackPublishOptions {
  readonly dependencies?: Record<string, string>;
}

interface JsonCommandResult {
  readonly exitCode: number;
  readonly stdout: {
    readonly command: string;
    readonly result: {
      readonly outcome: string;
      readonly appliedCount: number;
      readonly totalSteps: number;
      readonly steps: ReadonlyArray<{ readonly label: string }>;
    };
  };
  readonly stderr: string;
}

const settingsKeyForSurface = (surface: InstallSurface): SettingsKey =>
  surface === "mcps" ? "mcpServers" : surface;

const registryFqn = (surface: InstallSurface, name: string) => `${OWNER}/${surface}/${name}`;

const extensionDirForSurface = (workspacePath: string, surface: InstallSurface, name: string) =>
  path.join(workspacePath, ".axm", "extensions", OWNER, surface, name);

const configureWorkspaceRegistry = (workspacePath: string, registryPath: string) => {
  const settingsPath = path.join(workspacePath, ".axm", "settings.json");
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  settings.sources = [{ name: "local", type: "registry", location: `file://${registryPath}` }];
  settings.owner = OWNER;
  settings.minimumReleaseAge = "0s";
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
};

const configureWorkspaceEntries = (
  workspacePath: string,
  entries: Partial<Record<SettingsKey, Record<string, string>>>,
) => {
  const settingsPath = path.join(workspacePath, ".axm", "settings.json");
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  if (entries.skills !== undefined) {
    delete settings.skills?.axm;
  }

  for (const [key, value] of Object.entries(entries)) {
    settings[key] = {
      ...(settings[key] ?? {}),
      ...(value ?? {}),
    };
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
};

const initWorkspace = async (workspacePath: string, registryPath: string) => {
  const setup = await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: workspacePath });
  // Assert here rather than letting the next line fail: a setup that died
  // leaves no settings.json, and the resulting ENOENT surfaces several frames
  // away with setup's stderr already discarded — which reads like workspace
  // state corruption rather than the CLI failing to start.
  expect(setup.exitCode, setup.stderr).toBe(0);
  configureWorkspaceRegistry(workspacePath, registryPath);
};

const publishSkillToRegistry = async (registryPath: string, name: string) => {
  const workspace = createTempDir();

  try {
    await initWorkspace(workspace.path, registryPath);

    const createResult = await runCli(
      ["skills", "new", name, "--owner", OWNER, "--agent", "claude-code", "--yes"],
      { cwd: workspace.path },
    );
    expect(createResult.exitCode).toBe(0);

    const publishResult = await runCli(
      ["skills", "publish", registryFqn("skills", name), "--yes"],
      {
        cwd: workspace.path,
        env: PUBLISH_ENV,
      },
    );
    expect(publishResult.exitCode).toBe(0);
  } finally {
    workspace.cleanup();
  }
};

const publishSubagentToRegistry = async (registryPath: string, name: string) => {
  const workspace = createTempDir();

  try {
    await initWorkspace(workspace.path, registryPath);

    const createResult = await runCli(
      ["subagents", "new", name, "--owner", OWNER, "--agent", "claude-code", "--yes"],
      { cwd: workspace.path },
    );
    expect(createResult.exitCode).toBe(0);

    const publishResult = await runCli(
      ["subagents", "publish", registryFqn("subagents", name), "--yes"],
      { cwd: workspace.path, env: PUBLISH_ENV },
    );
    expect(publishResult.exitCode).toBe(0);
  } finally {
    workspace.cleanup();
  }
};

const publishMcpServerToRegistry = async (registryPath: string, name: string) => {
  const version = "1.0.0";
  const extensionDir = path.join(registryPath, "extensions", OWNER, "mcps", name);
  const archiveWorkspace = createTempDir("axm-mcp-server-");

  try {
    fs.mkdirSync(extensionDir, { recursive: true });
    fs.writeFileSync(
      path.join(extensionDir, "index.json"),
      JSON.stringify(
        {
          owner: OWNER,
          name,
          type: "mcp-server",
          publisherBindingId: "hbnd_test",
          versions: [
            {
              version,
              published: new Date("2026-01-01T00:00:00.000Z").toISOString(),
              integrity: "",
            },
          ],
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      path.join(archiveWorkspace.path, "mcp.json"),
      JSON.stringify(
        {
          owner: OWNER,
          type: "mcp-server",
          name,
          version,
          server: {
            name: `io.agentxm.test/${name}`,
            description: `Test MCP server ${name}`,
            version,
            packages: [
              {
                registryType: "npm",
                identifier: `@test/${name}`,
                version,
                transport: { type: "stdio" },
              },
            ],
          },
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(archiveWorkspace.path, "server.js"),
      `module.exports = { name: ${JSON.stringify(name)} };\n`,
    );

    execSync(
      `cd "${archiveWorkspace.path}" && zip -rq "${path.join(extensionDir, `${version}.zip`)}" .`,
    );
  } finally {
    archiveWorkspace.cleanup();
  }
};

const publishPackToRegistry = async (
  registryPath: string,
  name: string,
  options: PackPublishOptions = {
    dependencies: {
      [registryFqn("skills", `${name}-skill`)]: "*",
    },
  },
) => {
  const workspace = createTempDir();

  try {
    if (options.dependencies?.[registryFqn("skills", `${name}-skill`)] !== undefined) {
      await publishSkillToRegistry(registryPath, `${name}-skill`);
    }

    await initWorkspace(workspace.path, registryPath);

    const createResult = await runCli(["packs", "new", name, "--owner", OWNER, "--yes"], {
      cwd: workspace.path,
    });
    expect(createResult.exitCode).toBe(0);

    if (Object.keys(options).length > 0) {
      const manifestPath = path.join(
        workspace.path,
        ".axm",
        "extensions",
        OWNER,
        "packs",
        name,
        "pack.json",
      );
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      fs.writeFileSync(
        manifestPath,
        `${JSON.stringify(
          {
            ...manifest,
            ...options,
          },
          null,
          2,
        )}\n`,
      );
      refreshAuthoredWorkspacePackState(workspace.path, OWNER, name);
    }

    const publishResult = await runCli(["packs", "publish", registryFqn("packs", name), "--yes"], {
      cwd: workspace.path,
      env: PUBLISH_ENV,
    });
    expect(publishResult.exitCode).toBe(0);
  } finally {
    workspace.cleanup();
  }
};

/**
 * Scaffold-then-publish for the types whose `new` and `publish` verbs need no
 * per-type arguments beyond the owner. Skills and subagents scaffold per agent
 * and MCP servers are assembled as a raw archive, so those keep bespoke
 * publishers above.
 */
const publishScaffoldedToRegistry =
  (surface: InstallSurface) => async (registryPath: string, name: string) => {
    const workspace = createTempDir();

    try {
      await initWorkspace(workspace.path, registryPath);

      const createResult = await runCli([surface, "new", name, "--owner", OWNER, "--yes"], {
        cwd: workspace.path,
      });
      expect(createResult.exitCode).toBe(0);

      const publishResult = await runCli(
        [surface, "publish", registryFqn(surface, name), "--yes"],
        { cwd: workspace.path, env: PUBLISH_ENV },
      );
      expect(publishResult.exitCode).toBe(0);
    } finally {
      workspace.cleanup();
    }
  };

const readSettings = (workspacePath: string) =>
  JSON.parse(fs.readFileSync(path.join(workspacePath, ".axm", "settings.json"), "utf-8"));

const readLockfile = (workspacePath: string) =>
  YAML.parse(fs.readFileSync(path.join(workspacePath, ".axm", "axm-lock.yaml"), "utf-8"));

const normalizeLockEntry = (value: unknown) => {
  const copy = JSON.parse(JSON.stringify(value));

  if (typeof copy === "object" && copy !== null) {
    delete copy["installedAt"];
    delete copy["updatedAt"];
  }

  return copy;
};

const snapshotDir = (rootDir: string): Readonly<Record<string, string>> => {
  const files: Record<string, string> = {};

  const walk = (currentDir: string) => {
    const entries = fs
      .readdirSync(currentDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join("/");
      files[relativePath] = fs.readFileSync(absolutePath, "utf-8");
    }
  };

  walk(rootDir);
  return files;
};

const runJsonCommand = async (
  workspacePath: string,
  command: ReadonlyArray<string>,
  extraArgs: ReadonlyArray<string> = [],
): Promise<JsonCommandResult> => {
  const result = await runCli([...command, ...extraArgs, "--yes", "--json"], {
    cwd: workspacePath,
  });

  expect(result.exitCode, `stdout:\n${result.stdout}\n\nstderr:\n${result.stderr}`).toBe(0);
  return {
    exitCode: result.exitCode,
    stdout: JSON.parse(result.stdout),
    stderr: result.stderr,
  };
};

const expectConfiguredEntriesInstalled = (
  workspacePath: string,
  surface: InstallSurface,
  names: ReadonlyArray<string>,
) => {
  const settingsKey = settingsKeyForSurface(surface);
  const settings = readSettings(workspacePath);
  const lockfile = readLockfile(workspacePath);
  const settingsSection = settings[settingsKey] ?? {};
  const lockfileSection = lockfile[settingsKey] ?? {};

  for (const name of names) {
    expect(settingsSection[name]).toBeDefined();
    expect(lockfileSection[name]).toBeDefined();
    expect(fs.existsSync(extensionDirForSurface(workspacePath, surface, name))).toBe(true);
  }
};

/**
 * Publish helper per extension type, or `null` where no publish-then-install
 * round trip exists yet. Keyed by the generated union, so a new extension type
 * fails compile here until its coverage is decided; a `null` entry must be
 * matched by a `6.1-e2e-install-row` ledger row, which the guard tests below
 * check in both directions.
 */
const PUBLISHERS = {
  skill: publishSkillToRegistry,
  subagent: publishSubagentToRegistry,
  "mcp-server": publishMcpServerToRegistry,
  pack: publishPackToRegistry,
  hook: publishScaffoldedToRegistry("hooks"),
  knowledge: publishScaffoldedToRegistry("knowledge"),
  rule: publishScaffoldedToRegistry("rules"),
} as const satisfies Record<MatrixExtensionType, Publisher | null>;

const installCases = EXTENSION_TYPE_MATRIX.filter((row) => PUBLISHERS[row.type] !== null);
const uncoveredCases = EXTENSION_TYPE_MATRIX.filter((row) => PUBLISHERS[row.type] === null);

const publisherFor = (row: ExtensionTypeMatrixRow): Publisher => {
  const publish = PUBLISHERS[row.type];
  if (publish === null) {
    throw new Error(`no publisher registered for ${row.type}`);
  }
  return publish;
};

describe("axm install", () => {
  it("classifies every extension type as covered or ledgered", () => {
    // A type with neither a publisher nor a ledger row would silently vanish
    // from this suite.
    expect(uncoveredCases.filter((row) => row.e2eExemptions.length === 0)).toStrictEqual([]);
  });

  it("carries no ledger row for a type this suite covers", () => {
    // The other direction: coverage that lands without clearing its ledger row
    // leaves stale debt behind.
    expect(installCases.filter((row) => row.e2eExemptions.length > 0)).toStrictEqual([]);
  });

  for (const row of uncoveredCases) {
    it.skip(`installs a published ${row.sentenceLabel} — ${row.e2eExemptions.join(", ")}`, () => {
      // Skipped until the ledgered obligation clears; the title names it.
    });
  }

  it.each(installCases)(
    "matches $plural install output and workspace state for $label registry FQNs",
    async (row) => {
      const surface = row.plural;
      const publishToRegistry = publisherFor(row);
      const registryDir = createTempDir("axm-registry-");
      const rootWorkspace = createTempDir();
      const surfaceWorkspace = createTempDir();
      // Named from the type rather than a de-pluralized surface, which would
      // yield "knowledg". The MCP shortening keeps the historical fixture name.
      const name = `root-${row.type}`.replace("-mcp-server", "-mcp");

      try {
        await publishToRegistry(registryDir.path, name);

        await initWorkspace(rootWorkspace.path, registryDir.path);
        await initWorkspace(surfaceWorkspace.path, registryDir.path);

        const fqn = registryFqn(surface, name);

        const rootResult = await runJsonCommand(rootWorkspace.path, ["install"], [fqn]);
        const surfaceResult = await runJsonCommand(
          surfaceWorkspace.path,
          [surface, "install"],
          [fqn],
        );

        expect(rootResult.exitCode).toBe(surfaceResult.exitCode);
        expect(rootResult.stdout.result).toEqual(surfaceResult.stdout.result);
        expect(rootResult.stderr).toBe(surfaceResult.stderr);

        const settingsKey = settingsKeyForSurface(surface);
        const rootSettings = readSettings(rootWorkspace.path);
        const surfaceSettings = readSettings(surfaceWorkspace.path);
        expect(rootSettings[settingsKey][name]).toEqual(surfaceSettings[settingsKey][name]);

        const rootLockfile = readLockfile(rootWorkspace.path);
        const surfaceLockfile = readLockfile(surfaceWorkspace.path);
        expect(normalizeLockEntry(rootLockfile[settingsKey][name])).toEqual(
          normalizeLockEntry(surfaceLockfile[settingsKey][name]),
        );

        expect(snapshotDir(extensionDirForSurface(rootWorkspace.path, surface, name))).toEqual(
          snapshotDir(extensionDirForSurface(surfaceWorkspace.path, surface, name)),
        );
      } finally {
        registryDir.cleanup();
        rootWorkspace.cleanup();
        surfaceWorkspace.cleanup();
      }
    },
  );

  it.each(installCases)(
    "installs all configured $label entries for no-arg $plural install",
    async (row) => {
      const surface = row.plural;
      const publishToRegistry = publisherFor(row);
      const registryDir = createTempDir("axm-registry-");
      const workspace = createTempDir();
      const names = [
        `${surface}-one`.replace("mcps", "mcp"),
        `${surface}-two`.replace("mcps", "mcp"),
      ] as const;
      const [firstName, secondName] = names;

      try {
        await publishToRegistry(registryDir.path, firstName);
        await publishToRegistry(registryDir.path, secondName);

        await initWorkspace(workspace.path, registryDir.path);
        configureWorkspaceEntries(workspace.path, {
          [settingsKeyForSurface(surface)]: Object.fromEntries(
            names.map((name) => [name, registryFqn(surface, name)]),
          ),
        });

        const result = await runJsonCommand(workspace.path, [surface, "install"]);

        expect(result.stdout.result.outcome).toBe("applied");
        expect(result.stdout.result.appliedCount).toBe(surface === "packs" ? 4 : 2);
        expectConfiguredEntriesInstalled(workspace.path, surface, names);
      } finally {
        registryDir.cleanup();
        workspace.cleanup();
      }
    },
  );

  it("installs configured extensions across types for no-arg root install", async () => {
    const registryDir = createTempDir("axm-registry-");
    const workspace = createTempDir();

    try {
      await publishSkillToRegistry(registryDir.path, "workspace-skill");
      await publishSubagentToRegistry(registryDir.path, "workspace-subagent");
      await publishMcpServerToRegistry(registryDir.path, "workspace-mcp");
      await publishScaffoldedToRegistry("rules")(registryDir.path, "workspace-rule");
      await publishMcpServerToRegistry(registryDir.path, "pack-mcp");
      await publishPackToRegistry(registryDir.path, "workspace-pack", {
        dependencies: {
          [registryFqn("skills", "workspace-skill")]: "*",
          [registryFqn("mcps", "pack-mcp")]: "*",
        },
      });

      await initWorkspace(workspace.path, registryDir.path);
      configureWorkspaceEntries(workspace.path, {
        skills: { "workspace-skill": registryFqn("skills", "workspace-skill") },
        subagents: { "workspace-subagent": registryFqn("subagents", "workspace-subagent") },
        mcpServers: { "workspace-mcp": registryFqn("mcps", "workspace-mcp") },
        rules: { "workspace-rule": registryFqn("rules", "workspace-rule") },
        packs: { "workspace-pack": registryFqn("packs", "workspace-pack") },
      });

      const result = await runJsonCommand(workspace.path, ["install"]);
      const labels = result.stdout.result.steps.map((step) => step.label);

      expect(result.stdout.result.outcome).toBe("applied");
      expect(result.stdout.result.appliedCount).toBe(6);
      expect(labels.filter((label) => label.includes("workspace-skill"))).toHaveLength(1);
      expect(labels.some((label) => label.includes("pack-mcp"))).toBe(true);

      expectConfiguredEntriesInstalled(workspace.path, "skills", ["workspace-skill"]);
      expectConfiguredEntriesInstalled(workspace.path, "subagents", ["workspace-subagent"]);
      expectConfiguredEntriesInstalled(workspace.path, "mcps", ["workspace-mcp"]);
      expectConfiguredEntriesInstalled(workspace.path, "rules", ["workspace-rule"]);
      expectConfiguredEntriesInstalled(workspace.path, "packs", ["workspace-pack"]);

      const settings = readSettings(workspace.path);
      const lockfile = readLockfile(workspace.path);
      expect(settings.mcpServers?.["pack-mcp"]).toBeUndefined();
      expect(lockfile.mcpServers?.["pack-mcp"]).toBeDefined();
      expect(fs.existsSync(extensionDirForSurface(workspace.path, "mcps", "pack-mcp"))).toBe(true);
    } finally {
      registryDir.cleanup();
      workspace.cleanup();
    }
  });

  it("updates existing Claude Code MCP config without a workspace backup", async () => {
    const registryDir = createTempDir("axm-registry-");
    const workspace = createTempDir();

    try {
      await publishMcpServerToRegistry(registryDir.path, "context");
      await initWorkspace(workspace.path, registryDir.path);

      const mcpConfigPath = path.join(workspace.path, ".mcp.json");
      fs.writeFileSync(
        mcpConfigPath,
        JSON.stringify({ mcpServers: { existing: { command: "echo" } } }, null, 2),
      );

      const result = await runJsonCommand(
        workspace.path,
        ["mcps", "install"],
        [registryFqn("mcps", "context")],
      );

      expect(result.stdout.result.outcome).toBe("applied");
      expect(fs.existsSync(`${mcpConfigPath}.bak`)).toBe(false);
      const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
      expect(mcpConfig.mcpServers.existing.command).toBe("echo");
      expect(Object.keys(mcpConfig.mcpServers).filter((key) => key !== "existing")).toHaveLength(1);
    } finally {
      registryDir.cleanup();
      workspace.cleanup();
    }
  });

  it("keeps same-name configured installs across extension types", async () => {
    const registryDir = createTempDir("axm-registry-");
    const workspace = createTempDir();

    try {
      await publishSkillToRegistry(registryDir.path, "shared-name");
      await publishScaffoldedToRegistry("rules")(registryDir.path, "shared-name");

      await initWorkspace(workspace.path, registryDir.path);
      configureWorkspaceEntries(workspace.path, {
        skills: { "shared-name": registryFqn("skills", "shared-name") },
        rules: { "shared-name": registryFqn("rules", "shared-name") },
      });

      const result = await runJsonCommand(workspace.path, ["install"]);

      expect(result.stdout.result.outcome).toBe("applied");
      expect(result.stdout.result.appliedCount).toBe(2);
      expect(result.stdout.result.totalSteps).toBe(2);
      expectConfiguredEntriesInstalled(workspace.path, "skills", ["shared-name"]);
      expectConfiguredEntriesInstalled(workspace.path, "rules", ["shared-name"]);
    } finally {
      registryDir.cleanup();
      workspace.cleanup();
    }
  });
});
