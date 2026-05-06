import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli } from "./e2e/utils.js";

const OWNER = "@test";
const PUBLISH_ENV = { AXM_TOKEN: "e2e-test-token" };

type UninstallSurface = "skills" | "commands" | "subagents" | "packs";

interface PackPublishOptions {
  readonly skills?: Record<string, string>;
  readonly commands?: Record<string, string>;
  readonly "mcp-servers"?: Record<string, string>;
  readonly subagents?: Record<string, string>;
}

interface JsonCommandResult {
  readonly exitCode: number;
  readonly stdout: unknown;
  readonly stderr: string;
}

interface UninstallCase {
  readonly label: string;
  readonly surface: UninstallSurface;
  readonly name: string;
  readonly version: string;
  readonly publishToRegistry: (registryPath: string) => Promise<void>;
  readonly assertAdditionalCleanup?: (
    rootWorkspacePath: string,
    typedWorkspacePath: string,
  ) => void;
}

const registryFqn = (surface: UninstallSurface, name: string, version?: string) =>
  version === undefined ? `${OWNER}/${surface}/${name}` : `${OWNER}/${surface}/${name}@${version}`;

const extensionDirForSurface = (workspacePath: string, surface: UninstallSurface, name: string) =>
  path.join(workspacePath, ".axm", "extensions", OWNER, surface, name);

const renderedSkillDir = (workspacePath: string, name: string) =>
  path.join(workspacePath, ".claude", "skills", name);

const configureWorkspaceRegistry = (workspacePath: string, registryPath: string) => {
  const settingsPath = path.join(workspacePath, ".axm", "settings.json");
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

  settings.sources = [{ name: "local", type: "registry", location: `file://${registryPath}` }];
  settings.owner = OWNER;

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
};

const initWorkspace = async (workspacePath: string, registryPath: string) => {
  const result = await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: workspacePath });
  expect(result.exitCode, `stdout:\n${result.stdout}\n\nstderr:\n${result.stderr}`).toBe(0);
  configureWorkspaceRegistry(workspacePath, registryPath);
};

const publishSkillToRegistry = async (registryPath: string, name: string) => {
  const workspace = createTempDir();

  try {
    await initWorkspace(workspace.path, registryPath);

    const createResult = await runCli(
      ["skills", "new", name, "--profile", OWNER, "--agent", "claude-code", "--yes"],
      { cwd: workspace.path },
    );
    expect(
      createResult.exitCode,
      `stdout:\n${createResult.stdout}\n\nstderr:\n${createResult.stderr}`,
    ).toBe(0);

    const publishResult = await runCli(
      ["skills", "publish", registryFqn("skills", name), "--yes"],
      { cwd: workspace.path, env: PUBLISH_ENV },
    );
    expect(
      publishResult.exitCode,
      `stdout:\n${publishResult.stdout}\n\nstderr:\n${publishResult.stderr}`,
    ).toBe(0);
  } finally {
    workspace.cleanup();
  }
};

const publishCommandToRegistry = async (registryPath: string, name: string) => {
  const workspace = createTempDir();

  try {
    await initWorkspace(workspace.path, registryPath);

    const createResult = await runCli(["commands", "new", name, "--profile", OWNER, "--yes"], {
      cwd: workspace.path,
    });
    expect(
      createResult.exitCode,
      `stdout:\n${createResult.stdout}\n\nstderr:\n${createResult.stderr}`,
    ).toBe(0);

    const publishResult = await runCli(
      ["commands", "publish", registryFqn("commands", name), "--yes"],
      { cwd: workspace.path, env: PUBLISH_ENV },
    );
    expect(
      publishResult.exitCode,
      `stdout:\n${publishResult.stdout}\n\nstderr:\n${publishResult.stderr}`,
    ).toBe(0);
  } finally {
    workspace.cleanup();
  }
};

const publishSubagentToRegistry = async (registryPath: string, name: string) => {
  const workspace = createTempDir();

  try {
    await initWorkspace(workspace.path, registryPath);

    const createResult = await runCli(
      ["subagents", "new", name, "--profile", OWNER, "--agent", "claude-code", "--yes"],
      { cwd: workspace.path },
    );
    expect(
      createResult.exitCode,
      `stdout:\n${createResult.stdout}\n\nstderr:\n${createResult.stderr}`,
    ).toBe(0);

    const publishResult = await runCli(
      ["subagents", "publish", registryFqn("subagents", name), "--yes"],
      { cwd: workspace.path, env: PUBLISH_ENV },
    );
    expect(
      publishResult.exitCode,
      `stdout:\n${publishResult.stdout}\n\nstderr:\n${publishResult.stderr}`,
    ).toBe(0);
  } finally {
    workspace.cleanup();
  }
};

const publishPackToRegistry = async (
  registryPath: string,
  name: string,
  options: PackPublishOptions = {},
) => {
  const workspace = createTempDir();

  try {
    await initWorkspace(workspace.path, registryPath);

    const createResult = await runCli(["packs", "new", name, "--profile", OWNER, "--yes"], {
      cwd: workspace.path,
    });
    expect(
      createResult.exitCode,
      `stdout:\n${createResult.stdout}\n\nstderr:\n${createResult.stderr}`,
    ).toBe(0);

    if (Object.keys(options).length > 0) {
      const manifestPath = path.join(
        workspace.path,
        ".axm",
        "extensions",
        OWNER,
        "packs",
        name,
        "extension-pack.json",
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
    expect(
      publishResult.exitCode,
      `stdout:\n${publishResult.stdout}\n\nstderr:\n${publishResult.stderr}`,
    ).toBe(0);
  } finally {
    workspace.cleanup();
  }
};

const normalizeJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJsonValue(entry));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "command" && key !== "installedAt" && key !== "updatedAt")
      .map(([key, entry]) => [key, normalizeJsonValue(entry)]),
  );
};

const readSettings = (workspacePath: string): unknown =>
  normalizeJsonValue(
    JSON.parse(fs.readFileSync(path.join(workspacePath, ".axm", "settings.json"), "utf-8")),
  );

const readLockfile = (workspacePath: string): unknown =>
  normalizeJsonValue(
    YAML.parse(fs.readFileSync(path.join(workspacePath, ".axm", "axm-lock.yaml"), "utf-8")),
  );

const runJsonCommand = async (
  workspacePath: string,
  args: ReadonlyArray<string>,
): Promise<JsonCommandResult> => {
  const result = await runCli([...args, "--yes", "--json"], { cwd: workspacePath });

  return {
    exitCode: result.exitCode,
    stdout: normalizeJsonValue(JSON.parse(result.stdout)),
    stderr: result.stderr,
  };
};

const installRegistryExtension = async (
  workspacePath: string,
  surface: UninstallSurface,
  source: string,
) => {
  const result = await runCli([surface, "install", source, "--yes"], { cwd: workspacePath });
  expect(result.exitCode, `stdout:\n${result.stdout}\n\nstderr:\n${result.stderr}`).toBe(0);
};

const expectWorkspaceStateEquivalent = (rootWorkspacePath: string, typedWorkspacePath: string) => {
  expect(readSettings(rootWorkspacePath)).toEqual(readSettings(typedWorkspacePath));
  expect(readLockfile(rootWorkspacePath)).toEqual(readLockfile(typedWorkspacePath));
};

const expectSameCanonicalState = (
  rootWorkspacePath: string,
  typedWorkspacePath: string,
  surface: UninstallSurface,
  name: string,
) => {
  const rootExists = fs.existsSync(extensionDirForSurface(rootWorkspacePath, surface, name));
  const typedExists = fs.existsSync(extensionDirForSurface(typedWorkspacePath, surface, name));

  expect(rootExists).toBe(typedExists);

  expect(rootExists).toBe(false);
};

const uninstallCases: ReadonlyArray<UninstallCase> = [
  {
    label: "skill",
    surface: "skills",
    name: "root-uninstall-skill",
    version: "0.1.0",
    publishToRegistry: (registryPath: string) =>
      publishSkillToRegistry(registryPath, "root-uninstall-skill"),
    assertAdditionalCleanup: (rootWorkspacePath: string, typedWorkspacePath: string) => {
      expect(fs.existsSync(renderedSkillDir(rootWorkspacePath, "root-uninstall-skill"))).toBe(
        false,
      );
      expect(fs.existsSync(renderedSkillDir(typedWorkspacePath, "root-uninstall-skill"))).toBe(
        false,
      );
    },
  },
  {
    label: "command",
    surface: "commands",
    name: "root-uninstall-command",
    version: "0.1.0",
    publishToRegistry: (registryPath: string) =>
      publishCommandToRegistry(registryPath, "root-uninstall-command"),
  },
  {
    label: "subagent",
    surface: "subagents",
    name: "root-uninstall-subagent",
    version: "0.0.1",
    publishToRegistry: (registryPath: string) =>
      publishSubagentToRegistry(registryPath, "root-uninstall-subagent"),
  },
  {
    label: "pack",
    surface: "packs",
    name: "root-uninstall-pack",
    version: "0.0.1",
    publishToRegistry: async (registryPath: string) => {
      await publishSkillToRegistry(registryPath, "root-uninstall-pack-skill");
      await publishPackToRegistry(registryPath, "root-uninstall-pack", {
        skills: {
          [registryFqn("skills", "root-uninstall-pack-skill")]: "*",
        },
      });
    },
    assertAdditionalCleanup: (rootWorkspacePath: string, typedWorkspacePath: string) => {
      expect(
        fs.existsSync(
          extensionDirForSurface(rootWorkspacePath, "skills", "root-uninstall-pack-skill"),
        ),
      ).toBe(false);
      expect(
        fs.existsSync(
          extensionDirForSurface(typedWorkspacePath, "skills", "root-uninstall-pack-skill"),
        ),
      ).toBe(false);
      expect(fs.existsSync(renderedSkillDir(rootWorkspacePath, "root-uninstall-pack-skill"))).toBe(
        false,
      );
      expect(fs.existsSync(renderedSkillDir(typedWorkspacePath, "root-uninstall-pack-skill"))).toBe(
        false,
      );
    },
  },
];

describe("axm uninstall", () => {
  it.each(uninstallCases)(
    "matches $surface uninstall output and workspace state for $label registry FQNs",
    async ({ surface, name, version, publishToRegistry, assertAdditionalCleanup }) => {
      const registryDir = createTempDir("axm-registry-");
      const rootWorkspace = createTempDir();
      const typedWorkspace = createTempDir();

      try {
        await publishToRegistry(registryDir.path);
        await initWorkspace(rootWorkspace.path, registryDir.path);
        await initWorkspace(typedWorkspace.path, registryDir.path);

        await installRegistryExtension(rootWorkspace.path, surface, registryFqn(surface, name));
        await installRegistryExtension(typedWorkspace.path, surface, registryFqn(surface, name));

        const rootResult = await runJsonCommand(rootWorkspace.path, [
          "uninstall",
          registryFqn(surface, name, version),
        ]);
        const typedResult = await runJsonCommand(typedWorkspace.path, [surface, "uninstall", name]);

        expect(rootResult.exitCode).toBe(0);
        expect(typedResult.exitCode).toBe(0);
        expect(rootResult.stdout).toEqual(typedResult.stdout);
        expect(rootResult.stderr).toBe(typedResult.stderr);
        expectWorkspaceStateEquivalent(rootWorkspace.path, typedWorkspace.path);
        expectSameCanonicalState(rootWorkspace.path, typedWorkspace.path, surface, name);
        assertAdditionalCleanup?.(rootWorkspace.path, typedWorkspace.path);

        const rootSecondPass = await runJsonCommand(rootWorkspace.path, [
          "uninstall",
          registryFqn(surface, name, version),
        ]);
        const typedSecondPass = await runJsonCommand(typedWorkspace.path, [
          surface,
          "uninstall",
          name,
        ]);

        expect(rootSecondPass.exitCode).toBe(typedSecondPass.exitCode);
        expect(rootSecondPass.stdout).toEqual(typedSecondPass.stdout);
        expect(rootSecondPass.stderr).toBe(typedSecondPass.stderr);
        expectWorkspaceStateEquivalent(rootWorkspace.path, typedWorkspace.path);
        expectSameCanonicalState(rootWorkspace.path, typedWorkspace.path, surface, name);
        assertAdditionalCleanup?.(rootWorkspace.path, typedWorkspace.path);
      } finally {
        registryDir.cleanup();
        rootWorkspace.cleanup();
        typedWorkspace.cleanup();
      }
    },
  );
});
