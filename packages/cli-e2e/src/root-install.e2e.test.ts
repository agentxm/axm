import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli } from "./e2e/utils.js";

const OWNER = "@test";
const PUBLISH_ENV = { AXM_TOKEN: "e2e-test-token" };

type InstallSurface = "skills" | "commands" | "subagents" | "packs" | "mcp-servers";
type SettingsKey = "skills" | "commands" | "subagents" | "packs" | "mcpServers";

interface InstallCase {
  readonly label: string;
  readonly surface: InstallSurface;
  readonly publishToRegistry: (
    registryPath: string,
    name: string,
    options?: PackPublishOptions,
  ) => Promise<void>;
}

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
  surface === "mcp-servers" ? "mcpServers" : surface;

const registryFqn = (surface: InstallSurface, name: string) => `${OWNER}/${surface}/${name}`;

const extensionDirForSurface = (workspacePath: string, surface: InstallSurface, name: string) =>
  path.join(workspacePath, ".axm", "extensions", OWNER, surface, name);

const configureWorkspaceRegistry = (workspacePath: string, registryPath: string) => {
  const settingsPath = path.join(workspacePath, ".axm", "settings.json");
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  settings.sources = [{ name: "local", type: "registry", location: `file://${registryPath}` }];
  settings.owner = OWNER;
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
  await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: workspacePath });
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

const publishCommandToRegistry = async (registryPath: string, name: string) => {
  const workspace = createTempDir();

  try {
    await initWorkspace(workspace.path, registryPath);

    const createResult = await runCli(["commands", "new", name, "--owner", OWNER, "--yes"], {
      cwd: workspace.path,
    });
    expect(createResult.exitCode).toBe(0);

    const publishResult = await runCli(
      ["commands", "publish", registryFqn("commands", name), "--yes"],
      { cwd: workspace.path, env: PUBLISH_ENV },
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
  const extensionDir = path.join(registryPath, "extensions", OWNER, "mcp-servers", name);
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
      path.join(archiveWorkspace.path, "mcp-server.json"),
      JSON.stringify(
        {
          owner: OWNER,
          type: "mcp-server",
          name,
          version,
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

const installCases = [
  {
    label: "skill",
    surface: "skills",
    publishToRegistry: publishSkillToRegistry,
  },
  {
    label: "command",
    surface: "commands",
    publishToRegistry: publishCommandToRegistry,
  },
  {
    label: "subagent",
    surface: "subagents",
    publishToRegistry: publishSubagentToRegistry,
  },
  {
    label: "MCP server",
    surface: "mcp-servers",
    publishToRegistry: publishMcpServerToRegistry,
  },
  {
    label: "pack",
    surface: "packs",
    publishToRegistry: publishPackToRegistry,
  },
] as const satisfies ReadonlyArray<InstallCase>;

describe("axm install", () => {
  it.each(installCases)(
    "matches $surface install output and workspace state for $label registry FQNs",
    async ({ surface, publishToRegistry }) => {
      const registryDir = createTempDir("axm-registry-");
      const rootWorkspace = createTempDir();
      const surfaceWorkspace = createTempDir();
      const name = `root-${surface.slice(0, -1)}`.replace("-mcp-server", "-mcp");

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
    "installs all configured $label entries for no-arg $surface install",
    async ({ surface, publishToRegistry }) => {
      const registryDir = createTempDir("axm-registry-");
      const workspace = createTempDir();
      const names = [
        `${surface}-one`.replace("mcp-servers", "mcp"),
        `${surface}-two`.replace("mcp-servers", "mcp"),
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
      await publishCommandToRegistry(registryDir.path, "workspace-command");
      await publishSubagentToRegistry(registryDir.path, "workspace-subagent");
      await publishMcpServerToRegistry(registryDir.path, "workspace-mcp");
      await publishMcpServerToRegistry(registryDir.path, "pack-mcp");
      await publishPackToRegistry(registryDir.path, "workspace-pack", {
        dependencies: {
          [registryFqn("skills", "workspace-skill")]: "*",
          [registryFqn("mcp-servers", "pack-mcp")]: "*",
        },
      });

      await initWorkspace(workspace.path, registryDir.path);
      configureWorkspaceEntries(workspace.path, {
        skills: { "workspace-skill": registryFqn("skills", "workspace-skill") },
        commands: { "workspace-command": registryFqn("commands", "workspace-command") },
        subagents: { "workspace-subagent": registryFqn("subagents", "workspace-subagent") },
        mcpServers: { "workspace-mcp": registryFqn("mcp-servers", "workspace-mcp") },
        packs: { "workspace-pack": registryFqn("packs", "workspace-pack") },
      });

      const result = await runJsonCommand(workspace.path, ["install"]);
      const labels = result.stdout.result.steps.map((step) => step.label);

      expect(result.stdout.result.outcome).toBe("applied");
      expect(result.stdout.result.appliedCount).toBe(6);
      expect(labels.filter((label) => label.includes("workspace-skill"))).toHaveLength(1);
      expect(labels.some((label) => label.includes("pack-mcp"))).toBe(true);

      expectConfiguredEntriesInstalled(workspace.path, "skills", ["workspace-skill"]);
      expectConfiguredEntriesInstalled(workspace.path, "commands", ["workspace-command"]);
      expectConfiguredEntriesInstalled(workspace.path, "subagents", ["workspace-subagent"]);
      expectConfiguredEntriesInstalled(workspace.path, "mcp-servers", ["workspace-mcp"]);
      expectConfiguredEntriesInstalled(workspace.path, "packs", ["workspace-pack"]);

      const settings = readSettings(workspace.path);
      const lockfile = readLockfile(workspace.path);
      expect(settings.mcpServers?.["pack-mcp"]).toBeUndefined();
      expect(lockfile.mcpServers?.["pack-mcp"]).toBeDefined();
      expect(fs.existsSync(extensionDirForSurface(workspace.path, "mcp-servers", "pack-mcp"))).toBe(
        true,
      );
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
      await publishCommandToRegistry(registryDir.path, "shared-name");

      await initWorkspace(workspace.path, registryDir.path);
      configureWorkspaceEntries(workspace.path, {
        skills: { "shared-name": registryFqn("skills", "shared-name") },
        commands: { "shared-name": registryFqn("commands", "shared-name") },
      });

      const result = await runJsonCommand(workspace.path, ["install"]);

      expect(result.stdout.result.outcome).toBe("applied");
      expect(result.stdout.result.appliedCount).toBe(2);
      expect(result.stdout.result.totalSteps).toBe(2);
      expectConfiguredEntriesInstalled(workspace.path, "skills", ["shared-name"]);
      expectConfiguredEntriesInstalled(workspace.path, "commands", ["shared-name"]);
    } finally {
      registryDir.cleanup();
      workspace.cleanup();
    }
  });
});
