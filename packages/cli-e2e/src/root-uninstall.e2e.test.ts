import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli } from "./e2e/utils.js";
import { refreshAuthoredWorkspacePackState } from "./e2e/workspace-pack-state.js";

/**
 * Binds this file's evidence to the requirement identities it executes at the
 * process boundary. The literal shape is read by the specification catalog;
 * cli-e2e deliberately has no code dependency on the specifications package.
 */
export const executionBinding = {
  requirements: [
    "cli/uninstall/removes-direct-route-and-recomputes-reachability",
    "cli/uninstall/is-idempotent",
  ],
  boundary: "process",
  rationale:
    "Runs the real CLI against a published file registry, proving root and type-specific uninstall parity across extension types and scopes, the machine result document, exit codes, and second-pass no-op state that in-memory execution cannot observe.",
} as const;

const OWNER = "@test";
const PUBLISH_ENV = { AXM_TOKEN: "e2e-test-token" };

type UninstallSurface = "skills" | "rules" | "subagents" | "packs";

interface PackPublishOptions {
  readonly dependencies?: Record<string, string>;
}

interface JsonCommandResult {
  readonly exitCode: number;
  /** Parity-comparable machine document: invocation-specific fields removed. */
  readonly stdout: unknown;
  /** The raw `result` payload for direct document assertions. */
  readonly result: Readonly<Record<string, unknown>>;
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

const extensionDirForSurface = (
  workspacePath: string,
  surface: UninstallSurface,
  name: string,
  scope: "project" | "user" = "project",
) =>
  path.join(
    workspacePath,
    ...(scope === "user" ? [".axm", "workspace"] : []),
    "agent_extensions",
    "agentxm",
    OWNER,
    surface,
    name,
  );

const renderedSkillDir = (workspacePath: string, name: string) =>
  path.join(workspacePath, ".claude", "skills", name);

const configureWorkspaceRegistry = (
  workspacePath: string,
  registryPath: string,
  scope: "project" | "user" = "project",
) => {
  const settingsPath =
    scope === "project"
      ? path.join(workspacePath, "axm.json")
      : path.join(workspacePath, ".axm", "workspace", "axm.json");
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

  settings.sources = [{ name: "agentxm", type: "registry", location: `file://${registryPath}` }];
  settings.owner = OWNER;

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
};

const initWorkspace = async (workspacePath: string, registryPath: string) => {
  const result = await runCli(["setup", "--yes", "--scope", "project", "--agent", "claude-code"], {
    cwd: workspacePath,
  });
  expect(result.exitCode, `stdout:\n${result.stdout}\n\nstderr:\n${result.stderr}`).toBe(0);
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

const publishRuleToRegistry = async (registryPath: string, name: string) => {
  const workspace = createTempDir();

  try {
    await initWorkspace(workspace.path, registryPath);

    const createResult = await runCli(["rules", "new", name, "--owner", OWNER, "--yes"], {
      cwd: workspace.path,
    });
    expect(
      createResult.exitCode,
      `stdout:\n${createResult.stdout}\n\nstderr:\n${createResult.stderr}`,
    ).toBe(0);

    const publishResult = await runCli(["rules", "publish", registryFqn("rules", name), "--yes"], {
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

const publishSubagentToRegistry = async (registryPath: string, name: string) => {
  const workspace = createTempDir();

  try {
    await initWorkspace(workspace.path, registryPath);

    const createResult = await runCli(
      ["subagents", "new", name, "--owner", OWNER, "--agent", "claude-code", "--yes"],
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

    const createResult = await runCli(["packs", "new", name, "--owner", OWNER, "--yes"], {
      cwd: workspace.path,
    });
    expect(
      createResult.exitCode,
      `stdout:\n${createResult.stdout}\n\nstderr:\n${createResult.stderr}`,
    ).toBe(0);

    if (Object.keys(options).length > 0) {
      const manifestPath = path.join(workspace.path, "packs", name, "pack.json");
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
    expect(
      publishResult.exitCode,
      `stdout:\n${publishResult.stdout}\n\nstderr:\n${publishResult.stderr}`,
    ).toBe(0);
  } finally {
    workspace.cleanup();
  }
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

const readSettings = (workspacePath: string, scope: "project" | "user" = "project"): unknown =>
  normalizeJsonValue(
    JSON.parse(
      fs.readFileSync(
        scope === "project"
          ? path.join(workspacePath, "axm.json")
          : path.join(workspacePath, ".axm", "workspace", "axm.json"),
        "utf-8",
      ),
    ),
  );

const readLockfile = (workspacePath: string, scope: "project" | "user" = "project"): unknown =>
  normalizeJsonValue(
    YAML.parse(
      fs.readFileSync(
        scope === "project"
          ? path.join(workspacePath, "axm-lock.yaml")
          : path.join(workspacePath, ".axm", "workspace", "axm-lock.yaml"),
        "utf-8",
      ),
    ),
  );

const documentResult = (document: unknown): Readonly<Record<string, unknown>> => {
  if (!isRecord(document) || !isRecord(document["result"])) {
    throw new Error(`machine document has no result payload: ${JSON.stringify(document)}`);
  }
  return document["result"];
};

// Progress events carry a monotonic `atMs` timestamp by design; parity between
// two invocations is over the event sequence with that free field folded out.
const comparableStderr = (stderr: string): string =>
  stderr
    .split("\n")
    .map((line) => {
      try {
        const event: unknown = JSON.parse(line);
        if (typeof event === "object" && event !== null && "atMs" in event) {
          const { atMs: _atMs, ...rest } = event;
          return JSON.stringify(rest);
        }
        return line;
      } catch {
        return line;
      }
    })
    .join("\n");

const runJsonCommand = async (
  workspacePath: string,
  args: ReadonlyArray<string>,
): Promise<JsonCommandResult> => {
  const result = await runCli([...args, "--yes", "--json"], { cwd: workspacePath });
  const document: unknown = JSON.parse(result.stdout);

  return {
    exitCode: result.exitCode,
    stdout: normalizeJsonValue(document),
    result: documentResult(document),
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

const expectAppliedUninstallDocument = (result: JsonCommandResult) => {
  expect(result.result).toMatchObject({
    contract: "plan-result-v3",
    outcome: "applied",
    mode: "apply",
    counts: {
      total: 1,
      committed: 1,
      failed: 0,
      blocked: 0,
      rolledBack: 0,
      cancelled: 0,
    },
    units: [expect.objectContaining({ state: "committed" })],
  });
  expect(result.result["candidateId"]).toMatch(/^[0-9a-f]{64}$/);
};

const expectUninstallFootprint = (result: JsonCommandResult) => {
  expect(result.result["footprint"]).toEqual(
    expect.arrayContaining([
      { path: "axm.json", change: "modified" },
      { path: "axm-lock.yaml", change: "modified" },
    ]),
  );
};

const expectWorkspaceStateEquivalent = (
  rootWorkspacePath: string,
  typedWorkspacePath: string,
  scope: "project" | "user" = "project",
) => {
  expect(readSettings(rootWorkspacePath, scope)).toEqual(readSettings(typedWorkspacePath, scope));
  expect(readLockfile(rootWorkspacePath, scope)).toEqual(readLockfile(typedWorkspacePath, scope));
};

const expectSameCanonicalState = (
  rootWorkspacePath: string,
  typedWorkspacePath: string,
  surface: UninstallSurface,
  name: string,
  scope: "project" | "user" = "project",
) => {
  const rootExists = fs.existsSync(extensionDirForSurface(rootWorkspacePath, surface, name, scope));
  const typedExists = fs.existsSync(
    extensionDirForSurface(typedWorkspacePath, surface, name, scope),
  );

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
    label: "rule",
    surface: "rules",
    name: "root-uninstall-rule",
    version: "0.1.0",
    publishToRegistry: (registryPath: string) =>
      publishRuleToRegistry(registryPath, "root-uninstall-rule"),
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
        dependencies: {
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
        expectAppliedUninstallDocument(rootResult);
        expectAppliedUninstallDocument(typedResult);
        expectUninstallFootprint(rootResult);
        expect(rootResult.stdout).toEqual(typedResult.stdout);
        expect(comparableStderr(rootResult.stderr)).toBe(comparableStderr(typedResult.stderr));
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

        expect(rootSecondPass.exitCode).toBe(0);
        expect(typedSecondPass.exitCode).toBe(0);
        expect(rootSecondPass.result).toMatchObject({
          contract: "plan-result-v3",
          outcome: "no-op",
          counts: { total: 0, committed: 0 },
        });
        expect(rootSecondPass.stdout).toEqual(typedSecondPass.stdout);
        expect(comparableStderr(rootSecondPass.stderr)).toBe(
          comparableStderr(typedSecondPass.stderr),
        );
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

  it("matches per-type uninstall at user scope", async () => {
    const registryDir = createTempDir("axm-registry-");
    const rootWorkspace = createTempDir("axm-root-user-");
    const typedWorkspace = createTempDir("axm-typed-user-");
    const rootHome = createTempDir("axm-root-home-");
    const typedHome = createTempDir("axm-typed-home-");
    const name = "root-uninstall-user-skill";
    const rootEnv = { AXM_USER_HOME: rootWorkspace.path, HOME: rootHome.path };
    const typedEnv = { AXM_USER_HOME: typedWorkspace.path, HOME: typedHome.path };

    try {
      await publishSkillToRegistry(registryDir.path, name);
      for (const [workspace, env] of [
        [rootWorkspace, rootEnv],
        [typedWorkspace, typedEnv],
      ] as const) {
        const setup = await runCli(
          ["setup", "--scope", "user", "--yes", "--agent", "claude-code"],
          { cwd: workspace.path, env },
        );
        expect(setup.exitCode, `${setup.stderr}\n${setup.stdout}`).toBe(0);
        configureWorkspaceRegistry(workspace.path, registryDir.path, "user");
        const install = await runCli(
          ["skills", "install", registryFqn("skills", name), "--scope", "user", "--yes"],
          { cwd: workspace.path, env },
        );
        expect(install.exitCode, `${install.stderr}\n${install.stdout}`).toBe(0);
      }

      const rootResult = await runCli(
        ["uninstall", registryFqn("skills", name), "--scope", "user", "--yes", "--json"],
        { cwd: rootWorkspace.path, env: rootEnv },
      );
      const typedResult = await runCli(
        ["skills", "uninstall", name, "--scope", "user", "--yes", "--json"],
        { cwd: typedWorkspace.path, env: typedEnv },
      );

      expect(rootResult.exitCode, `${rootResult.stderr}\n${rootResult.stdout}`).toBe(0);
      expect(typedResult.exitCode, `${typedResult.stderr}\n${typedResult.stdout}`).toBe(0);
      const rootDocument: unknown = JSON.parse(rootResult.stdout);
      const typedDocument: unknown = JSON.parse(typedResult.stdout);
      for (const result of [rootDocument, typedDocument]) {
        expect(documentResult(result)).toMatchObject({
          contract: "plan-result-v3",
          outcome: "applied",
          mode: "apply",
          counts: { total: 1, committed: 1, failed: 0, blocked: 0 },
        });
        expect(documentResult(result)["candidateId"]).toMatch(/^[0-9a-f]{64}$/);
      }
      // Candidate id and footprint compare too: identity is content-addressed
      // relative to the workspace base, and every mutating surface runs under
      // the operation lifecycle that records the footprint.
      expect(normalizeJsonValue(rootDocument)).toEqual(normalizeJsonValue(typedDocument));
      expectWorkspaceStateEquivalent(rootWorkspace.path, typedWorkspace.path, "user");
      expectSameCanonicalState(rootWorkspace.path, typedWorkspace.path, "skills", name, "user");
    } finally {
      registryDir.cleanup();
      rootWorkspace.cleanup();
      typedWorkspace.cleanup();
      rootHome.cleanup();
      typedHome.cleanup();
    }
  });
});
