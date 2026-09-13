import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { EXTENSION_TYPE_MATRIX } from "./__generated__/extension-type-matrix.js";
import { createTempDir, runCli } from "./e2e/utils.js";

/**
 * Binds this file's evidence to the requirement identities it executes at the
 * process boundary. The literal shape is read by the specification catalog;
 * cli-e2e deliberately has no code dependency on the specifications package.
 */
export const executionBinding = {
  requirements: [
    "cli/uninstall/removes-direct-route-and-recomputes-reachability",
    "cli/activation-follows-desired-state",
    "cli/mcps/projects-to-every-configured-agent",
  ],
  boundary: "process",
  rationale:
    "Drives every catalog extension type — including the mcp-server and pack types that cannot be sourced from a local package in memory — through authored creation, update, disable, enable, and uninstall in the real CLI process, proving preview purity, apply idempotency, native agent files, and lint-clean workspace state between every transition.",
} as const;

const readJson = (filePath: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(filePath, "utf8"));

const writeJson = (filePath: string, value: unknown): void => {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const extensionName = (plural: string): string => `atomic-${plural}`;

const canonicalDirectory = (workspace: string, plural: string): string =>
  path.join(workspace, plural, extensionName(plural));

const snapshotTree = (root: string): Readonly<Record<string, string>> => {
  const snapshot: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      if (entry.isDirectory()) {
        snapshot[relative] = "directory";
        visit(absolute);
      } else if (entry.isSymbolicLink()) {
        snapshot[relative] = `symlink:${fs.readlinkSync(absolute)}`;
      } else {
        snapshot[relative] = `file:${fs.readFileSync(absolute).toString("base64")}`;
      }
    }
  };
  visit(root);
  return snapshot;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const planFrom = (stdout: string): Readonly<Record<string, unknown>> => {
  const document: unknown = JSON.parse(stdout);
  if (!isRecord(document) || !isRecord(document["result"])) {
    throw new Error("Expected a JSON command result with a plan");
  }
  const result = document["result"];
  if (result["contract"] !== "plan-result-v3") {
    throw new Error("Expected a plan-result-v3 command result");
  }
  const units = result["units"];
  if (!Array.isArray(units)) {
    throw new Error("Expected a JSON command result with operation units");
  }
  const counts = result["counts"];
  return {
    total: isRecord(counts) ? counts["total"] : undefined,
    labels: units.map((unit) => (isRecord(unit) ? unit["label"] : undefined)),
  };
};

const planAgentOutcomes = (stdout: string): ReadonlyArray<Readonly<Record<string, unknown>>> => {
  const document: unknown = JSON.parse(stdout);
  if (!isRecord(document) || !isRecord(document["result"])) return [];
  const units = document["result"]["units"];
  if (!Array.isArray(units)) return [];
  return units.flatMap((unit) => {
    if (!isRecord(unit)) return [];
    const direct = unit["agentOutcomes"];
    if (Array.isArray(direct)) return direct.filter(isRecord);
    const artifact = unit["artifact"];
    if (!isRecord(artifact) || !Array.isArray(artifact["agentOutcomes"])) return [];
    return artifact["agentOutcomes"].filter(isRecord);
  });
};

const outcomeDecisions = (outcomes: ReadonlyArray<Readonly<Record<string, unknown>>>) =>
  outcomes.map(({ outcome: _outcome, ...decision }) => decision);

const showStatuses = (stdout: string): Readonly<Record<string, unknown>> => {
  const document: unknown = JSON.parse(stdout);
  if (!isRecord(document) || !isRecord(document["result"])) return {};
  const agents = document["result"]["agents"];
  if (!Array.isArray(agents)) return {};
  return Object.fromEntries(
    agents.flatMap((agent) =>
      isRecord(agent) && typeof agent["agent"] === "string"
        ? [[agent["agent"], agent["status"]]]
        : [],
    ),
  );
};

const lintRuleIds = (stdout: string): ReadonlyArray<string> => {
  const document: unknown = JSON.parse(stdout);
  if (!isRecord(document) || !isRecord(document["result"])) return [];
  const diagnostics = document["result"]["diagnostics"];
  if (!Array.isArray(diagnostics)) return [];
  return diagnostics.flatMap((diagnostic) =>
    isRecord(diagnostic) && typeof diagnostic["ruleId"] === "string" ? [diagnostic["ruleId"]] : [],
  );
};

const writeSymbolicMcpPackage = (workspace: string, withDefault = false): void => {
  const directory = path.join(workspace, "mcps", "mailer");
  fs.mkdirSync(directory, { recursive: true });
  writeJson(path.join(directory, "mcp.json"), {
    owner: "@test",
    type: "mcp-server",
    name: "mailer",
    version: "1.0.0",
    description: "A symbolic-input MCP server.",
    server: {
      name: "io.github.test/mailer",
      description: "A symbolic-input MCP server.",
      version: "1.0.0",
      packages: [
        {
          registryType: "npm",
          identifier: "@test/mailer-mcp",
          version: "1.0.0",
          transport: { type: "stdio" },
          environmentVariables: [
            {
              name: "MAILER_TOKEN",
              description: "Mailer token.",
              format: "string",
              isRequired: true,
              isSecret: true,
            },
            ...(withDefault ? [{ name: "REGION", value: "${REGION:-west}" }] : []),
          ],
        },
      ],
    },
  });
};

const inventoryOutcome = (
  stdout: string,
  name: string,
  agentId: string,
): Readonly<Record<string, unknown>> | undefined => {
  const document: unknown = JSON.parse(stdout);
  if (!isRecord(document) || !isRecord(document["result"])) return undefined;
  const items = document["result"]["items"];
  if (!Array.isArray(items)) return undefined;
  const item = items.find((candidate) => isRecord(candidate) && candidate["name"] === name);
  if (!isRecord(item) || !Array.isArray(item["agentOutcomes"])) return undefined;
  return item["agentOutcomes"].find(
    (outcome) => isRecord(outcome) && outcome["agentId"] === agentId,
  );
};

const expectInventoryOutcome = async (
  workspace: string,
  plural: string,
  name: string,
  expected: "current" | "not-applicable",
): Promise<void> => {
  const listed = await runCli([plural, "list", "--json"], { cwd: workspace });
  expect(listed.exitCode, listed.stdout + listed.stderr).toBe(0);
  expect(inventoryOutcome(listed.stdout, name, "claude-code")).toMatchObject({
    extensionType: expect.any(String),
    name,
    agentId: "claude-code",
    outcome: expected,
    reasonCode: expect.any(String),
    reason: expect.any(String),
  });
};

const runLifecycleMutation = async (
  workspace: string,
  command: ReadonlyArray<string>,
): Promise<void> => {
  const before = snapshotTree(workspace);
  const preview = await runCli([...command, "--preview", "--json", "--non-interactive"], {
    cwd: workspace,
  });
  expect(preview.exitCode, `preview ${command.join(" ")}\n${preview.stdout}${preview.stderr}`).toBe(
    0,
  );
  expect(snapshotTree(workspace), `preview purity for ${command.join(" ")}`).toEqual(before);

  const applied = await runCli([...command, "--json", "--non-interactive"], {
    cwd: workspace,
  });
  expect(applied.exitCode, `apply ${command.join(" ")}\n${applied.stdout}${applied.stderr}`).toBe(
    0,
  );
  expect(planFrom(applied.stdout), `preview/apply plan for ${command.join(" ")}`).toEqual(
    planFrom(preview.stdout),
  );
  const previewOutcomes = planAgentOutcomes(preview.stdout);
  const appliedOutcomes = planAgentOutcomes(applied.stdout);
  expect(previewOutcomes, `preview outcomes for ${command.join(" ")}`).not.toHaveLength(0);
  expect(appliedOutcomes, `apply outcomes for ${command.join(" ")}`).not.toHaveLength(0);
  expect(outcomeDecisions(appliedOutcomes)).toEqual(outcomeDecisions(previewOutcomes));
  const afterApply = snapshotTree(workspace);

  const second = await runCli([...command, "--json", "--non-interactive"], {
    cwd: workspace,
  });
  expect(second.exitCode, `second ${command.join(" ")}\n${second.stdout}${second.stderr}`).toBe(0);
  expect(snapshotTree(workspace), `idempotency for ${command.join(" ")}`).toEqual(afterApply);
};

const expectCleanWorkspace = async (cwd: string, context: string): Promise<void> => {
  const result = await runCli(["lint"], { cwd });
  expect(result.exitCode, `${context}: axm lint\n${result.stdout}${result.stderr}`).toBe(0);
};

describe("extension activation lifecycle", () => {
  it("keeps every extension type clean through enabled, disabled, and enabled state", async () => {
    const temp = createTempDir();

    try {
      const setup = await runCli(
        ["setup", "--scope", "project", "--agent", "claude-code", "--yes", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      const settingsPath = path.join(temp.path, "axm.json");
      writeJson(settingsPath, {
        ...readJson(settingsPath),
        owner: "@test",
        agents: ["claude-code"],
        lint: {
          rules: {
            "hook/matcher-raw-portability": "off",
            "workspace/agents-detected-declared": "off",
            "workspace/configured-but-not-installed": "off",
          },
        },
      });

      for (const row of EXTENSION_TYPE_MATRIX) {
        const name = extensionName(row.plural);
        const created = await runCli([row.plural, "new", name, "--non-interactive"], {
          cwd: temp.path,
        });
        expect(created.exitCode, `create ${row.type}\n${created.stdout}${created.stderr}`).toBe(0);
      }
      await expectCleanWorkspace(temp.path, "initial enabled state");
      for (const row of EXTENSION_TYPE_MATRIX) {
        await expectInventoryOutcome(
          temp.path,
          row.plural,
          extensionName(row.plural),
          row.configuredAgentPolicy === "not-applicable" ? "not-applicable" : "current",
        );
      }

      for (const row of EXTENSION_TYPE_MATRIX) {
        const name = extensionName(row.plural);
        const selection = row.updateSelection === "name-filter" ? ["--name", name] : [];
        await runLifecycleMutation(temp.path, [row.plural, "update", ...selection]);
        await expectCleanWorkspace(temp.path, `${row.type} updated`);
      }

      for (const row of EXTENSION_TYPE_MATRIX) {
        const name = extensionName(row.plural);
        await runLifecycleMutation(temp.path, [row.plural, "disable", name]);
        expect(
          fs.existsSync(canonicalDirectory(temp.path, row.plural)),
          `${row.type} canonical package retained after disable`,
        ).toBe(true);
        await expectCleanWorkspace(temp.path, `${row.type} disabled`);
        await expectInventoryOutcome(temp.path, row.plural, name, "not-applicable");

        await runLifecycleMutation(temp.path, [row.plural, "enable", name]);
        await expectInventoryOutcome(
          temp.path,
          row.plural,
          name,
          row.configuredAgentPolicy === "not-applicable" ? "not-applicable" : "current",
        );
        if (row.workspaceCapability === "instructions") {
          const instructions = fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8");
          expect(instructions).toContain("region=rules");
          expect(instructions).toContain("region=knowledge");
          expect(fs.readFileSync(path.join(temp.path, "CLAUDE.md"), "utf8")).toBe(instructions);
        }
        await expectCleanWorkspace(temp.path, `${row.type} re-enabled`);
      }

      for (const row of EXTENSION_TYPE_MATRIX) {
        const name = extensionName(row.plural);
        await runLifecycleMutation(temp.path, [row.plural, "uninstall", name]);
        await expectCleanWorkspace(temp.path, `${row.type} uninstalled`);
      }
    } finally {
      temp.cleanup();
    }
  }, 600_000);

  it("isolates project and user inventory for every extension type", async () => {
    const workspace = createTempDir();
    const userHome = createTempDir("axm-lifecycle-user-");
    const env = { AXM_USER_HOME: userHome.path, HOME: userHome.path };

    try {
      const projectSetup = await runCli(
        ["setup", "--scope", "project", "--agent", "claude-code", "--yes", "--non-interactive"],
        { cwd: workspace.path, env },
      );
      expect(projectSetup.exitCode, projectSetup.stdout + projectSetup.stderr).toBe(0);
      const projectSettingsPath = path.join(workspace.path, "axm.json");
      writeJson(projectSettingsPath, {
        ...readJson(projectSettingsPath),
        owner: "@test",
      });
      const userSetup = await runCli(
        ["setup", "--scope", "user", "--agent", "claude-code", "--yes", "--non-interactive"],
        { cwd: workspace.path, env },
      );
      expect(userSetup.exitCode, userSetup.stdout + userSetup.stderr).toBe(0);

      for (const row of EXTENSION_TYPE_MATRIX) {
        const name = extensionName(row.plural);
        const created = await runCli(
          [row.plural, "new", name, "--owner", "@test", "--non-interactive"],
          {
            cwd: workspace.path,
            env,
          },
        );
        expect(created.exitCode, `create ${row.type}\n${created.stdout}${created.stderr}`).toBe(0);

        const projectList = await runCli([row.plural, "list", "--scope", "project", "--json"], {
          cwd: workspace.path,
          env,
        });
        const userList = await runCli([row.plural, "list", "--scope", "user", "--json"], {
          cwd: workspace.path,
          env,
        });
        expect(projectList.exitCode, projectList.stdout + projectList.stderr).toBe(0);
        expect(userList.exitCode, userList.stdout + userList.stderr).toBe(0);
        expect(projectList.stdout, `${row.type} project inventory`).toContain(name);
        expect(userList.stdout, `${row.type} user inventory`).not.toContain(name);
      }
    } finally {
      workspace.cleanup();
      userHome.cleanup();
    }
  }, 90_000);

  it("keeps MCP activation, native state, inspection, and lint aligned", async () => {
    const temp = createTempDir();
    const agents = ["claude-code", "codex", "cursor", "gemini-cli", "github-copilot-cli"];
    const settingsPath = path.join(temp.path, "axm.json");
    const runJson = (args: ReadonlyArray<string>) =>
      runCli([...args, "--json", "--non-interactive"], { cwd: temp.path });

    try {
      writeJson(settingsPath, {
        owner: "@test",
        agents,
        mcpServers: {
          context: { url: "https://example.test/mcp", enabled: false },
        },
        lint: {
          rules: {
            "workspace/agents-detected-declared": "off",
            "workspace/configured-but-not-installed": "off",
          },
        },
      });

      const preview = await runJson(["mcps", "enable", "context", "--preview"]);
      expect(preview.exitCode, preview.stdout + preview.stderr).toBe(0);
      expect(planAgentOutcomes(preview.stdout)).toHaveLength(agents.length);
      expect(
        planAgentOutcomes(preview.stdout).every(({ outcome }) => outcome === "projected"),
        preview.stdout,
      ).toBe(true);

      const enabled = await runJson(["mcps", "enable", "context"]);
      expect(enabled.exitCode, enabled.stdout + enabled.stderr).toBe(0);
      expect(planAgentOutcomes(enabled.stdout)).toHaveLength(agents.length);
      expect(planAgentOutcomes(enabled.stdout).every(({ outcome }) => outcome === "current")).toBe(
        true,
      );
      const shownEnabled = await runJson(["mcps", "show", "context"]);
      expect(shownEnabled.exitCode, shownEnabled.stdout + shownEnabled.stderr).toBe(0);
      expect(showStatuses(shownEnabled.stdout)).toEqual(
        Object.fromEntries(agents.map((agent) => [agent, "current"])),
      );

      const disabled = await runJson(["mcps", "disable", "context"]);
      expect(disabled.exitCode, disabled.stdout + disabled.stderr).toBe(0);
      expect(
        planAgentOutcomes(disabled.stdout).every(({ outcome }) => outcome === "not-applicable"),
      ).toBe(true);
      expect(fs.readFileSync(path.join(temp.path, ".codex/config.toml"), "utf8")).not.toContain(
        "mcp_servers.context",
      );
      for (const relative of [".mcp.json", ".cursor/mcp.json", ".gemini/settings.json"]) {
        const native = readJson(path.join(temp.path, relative));
        expect(JSON.stringify(native), relative).not.toContain('"context"');
      }
      const shownDisabled = await runJson(["mcps", "show", "context"]);
      expect(shownDisabled.exitCode, shownDisabled.stdout + shownDisabled.stderr).toBe(0);
      expect(showStatuses(shownDisabled.stdout)).toEqual(
        Object.fromEntries(agents.map((agent) => [agent, "not-applicable"])),
      );
      const lint = await runJson(["lint"]);
      expect(lintRuleIds(lint.stdout)).not.toContain("workspace/agents-projections-stale");
      const synced = await runJson(["sync"]);
      expect(synced.exitCode, synced.stdout + synced.stderr).toBe(0);

      const reenabled = await runJson(["mcps", "enable", "context"]);
      expect(reenabled.exitCode, reenabled.stdout + reenabled.stderr).toBe(0);
      const repeated = await runJson(["mcps", "enable", "context"]);
      expect(repeated.exitCode, repeated.stdout + repeated.stderr).toBe(0);
      expect(planAgentOutcomes(repeated.stdout).every(({ outcome }) => outcome === "current")).toBe(
        true,
      );
    } finally {
      temp.cleanup();
    }
  }, 120_000);

  it("supports symbolic inputs and refuses incompatible shared default syntax", async () => {
    const shared = createTempDir();
    const independent = createTempDir();
    const mcpEntry = {
      source: "workspace",
      enabled: false,
      env: { MAILER_TOKEN: "${MAILER_TOKEN}" },
    };
    try {
      for (const workspace of [shared.path, independent.path]) writeSymbolicMcpPackage(workspace);
      writeSymbolicMcpPackage(shared.path, true);
      writeJson(path.join(shared.path, "axm.json"), {
        owner: "@test",
        agents: ["claude-code", "github-copilot-cli"],
        mcpServers: { mailer: mcpEntry },
      });
      const before = snapshotTree(shared.path);
      const sharedPreview = await runCli(
        ["mcps", "enable", "mailer", "--preview", "--json", "--non-interactive"],
        { cwd: shared.path },
      );
      const sharedApply = await runCli(
        ["mcps", "enable", "mailer", "--json", "--non-interactive"],
        { cwd: shared.path },
      );
      expect(sharedPreview.exitCode).not.toBe(0);
      expect(sharedApply.exitCode).not.toBe(0);
      for (const result of [sharedPreview, sharedApply]) {
        expect(result.stdout + result.stderr).toContain("github-copilot-cli");
        expect(result.stdout + result.stderr).toContain("shared MCP target '.mcp.json'");
      }
      expect(snapshotTree(shared.path)).toEqual(before);

      writeSymbolicMcpPackage(shared.path);
      for (const flags of [["--preview"], []]) {
        const supported = await runCli(
          ["mcps", "enable", "mailer", ...flags, "--json", "--non-interactive"],
          { cwd: shared.path },
        );
        expect(supported.exitCode, supported.stdout + supported.stderr).toBe(0);
      }
      expect(fs.readFileSync(path.join(shared.path, ".mcp.json"), "utf8")).toContain(
        "${MAILER_TOKEN}",
      );

      writeJson(path.join(independent.path, "axm.json"), {
        owner: "@test",
        agents: ["codex"],
        mcpServers: { mailer: mcpEntry },
      });
      const independentPreview = await runCli(
        ["mcps", "enable", "mailer", "--preview", "--json", "--non-interactive"],
        { cwd: independent.path },
      );
      expect(
        independentPreview.exitCode,
        independentPreview.stdout + independentPreview.stderr,
      ).toBe(0);
      expect(planAgentOutcomes(independentPreview.stdout)).toMatchObject([
        { agentId: "codex", outcome: "projected" },
      ]);
      const independentApply = await runCli(
        ["mcps", "enable", "mailer", "--json", "--non-interactive"],
        { cwd: independent.path },
      );
      expect(independentApply.exitCode, independentApply.stdout + independentApply.stderr).toBe(0);
      expect(planAgentOutcomes(independentApply.stdout)).toMatchObject([
        { agentId: "codex", outcome: "current" },
      ]);
      expect(fs.readFileSync(path.join(independent.path, ".codex/config.toml"), "utf8")).toContain(
        'env_vars = ["MAILER_TOKEN"]',
      );
      const shown = await runCli(["mcps", "show", "mailer", "--json"], {
        cwd: independent.path,
      });
      expect(showStatuses(shown.stdout)).toEqual({ codex: "current" });
    } finally {
      shared.cleanup();
      independent.cleanup();
    }
  }, 120_000);
});
