import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { EXTENSION_TYPE_MATRIX } from "./__generated__/extension-type-matrix.js";
import { createTempDir, runCli } from "./e2e/utils.js";

const readJson = (filePath: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(filePath, "utf8"));

const writeJson = (filePath: string, value: unknown): void => {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const extensionName = (plural: string): string => `atomic-${plural}`;

const canonicalDirectory = (workspace: string, plural: string): string =>
  path.join(workspace, ".axm", "extensions", "@test", plural, extensionName(plural));

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
  const steps = result["steps"];
  if (!Array.isArray(steps)) {
    throw new Error("Expected a JSON command result with plan steps");
  }
  return {
    totalSteps: result["totalSteps"],
    labels: steps.map((step) => (isRecord(step) ? step["label"] : undefined)),
  };
};

const runLifecycleMutation = async (
  workspace: string,
  command: ReadonlyArray<string>,
  confirmation: ReadonlyArray<string>,
): Promise<void> => {
  const before = snapshotTree(workspace);
  const preview = await runCli(
    [...command, ...confirmation, "--preview", "--json", "--non-interactive"],
    { cwd: workspace },
  );
  expect(preview.exitCode, `preview ${command.join(" ")}\n${preview.stdout}${preview.stderr}`).toBe(
    0,
  );
  expect(snapshotTree(workspace), `preview purity for ${command.join(" ")}`).toEqual(before);

  const applied = await runCli([...command, ...confirmation, "--json", "--non-interactive"], {
    cwd: workspace,
  });
  expect(applied.exitCode, `apply ${command.join(" ")}\n${applied.stdout}${applied.stderr}`).toBe(
    0,
  );
  expect(planFrom(applied.stdout), `preview/apply plan for ${command.join(" ")}`).toEqual(
    planFrom(preview.stdout),
  );
  const afterApply = snapshotTree(workspace);

  const second = await runCli([...command, ...confirmation, "--json", "--non-interactive"], {
    cwd: workspace,
  });
  expect(second.exitCode, `second ${command.join(" ")}\n${second.stdout}${second.stderr}`).toBe(0);
  expect(snapshotTree(workspace), `idempotency for ${command.join(" ")}`).toEqual(afterApply);
};

const expectCleanWorkspace = async (cwd: string, context: string): Promise<void> => {
  for (const command of [["status"], ["lint"]]) {
    const result = await runCli(command, { cwd });
    expect(
      result.exitCode,
      `${context}: axm ${command.join(" ")}\n${result.stdout}${result.stderr}`,
    ).toBe(0);
  }
};

describe("extension activation lifecycle", () => {
  it("keeps every extension type clean through enabled, disabled, and enabled state", async () => {
    const temp = createTempDir();

    try {
      const setup = await runCli(
        ["setup", "--agent", "claude-code", "--yes", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      const settingsPath = path.join(temp.path, ".axm", "settings.json");
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
        const created = await runCli([row.plural, "new", name, "--yes", "--non-interactive"], {
          cwd: temp.path,
        });
        expect(created.exitCode, `create ${row.type}\n${created.stdout}${created.stderr}`).toBe(0);
      }
      await expectCleanWorkspace(temp.path, "initial enabled state");

      for (const row of EXTENSION_TYPE_MATRIX) {
        const name = extensionName(row.plural);
        const selection = row.updateSelection === "name-filter" ? ["--name", name] : [];
        await runLifecycleMutation(temp.path, [row.plural, "update", ...selection], ["--yes"]);
        await expectCleanWorkspace(temp.path, `${row.type} updated`);
      }

      for (const row of EXTENSION_TYPE_MATRIX) {
        const name = extensionName(row.plural);
        const confirmation = row.activationConfirmation ? ["--yes"] : [];
        await runLifecycleMutation(temp.path, [row.plural, "disable", name], confirmation);
        expect(
          fs.existsSync(canonicalDirectory(temp.path, row.plural)),
          `${row.type} canonical package retained after disable`,
        ).toBe(true);
        await expectCleanWorkspace(temp.path, `${row.type} disabled`);

        await runLifecycleMutation(temp.path, [row.plural, "enable", name], confirmation);
        if (row.workspaceCapability === "instructions") {
          const instructions = fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8");
          expect(instructions).toContain("region=rules");
          expect(instructions).toContain("region=knowledge-base");
          expect(fs.readFileSync(path.join(temp.path, "CLAUDE.md"), "utf8")).toBe(instructions);
        }
        await expectCleanWorkspace(temp.path, `${row.type} re-enabled`);
      }

      for (const row of EXTENSION_TYPE_MATRIX) {
        const name = extensionName(row.plural);
        await runLifecycleMutation(temp.path, [row.plural, "uninstall", name], ["--yes"]);
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
        ["setup", "--agent", "claude-code", "--yes", "--non-interactive"],
        { cwd: workspace.path, env },
      );
      expect(projectSetup.exitCode, projectSetup.stdout + projectSetup.stderr).toBe(0);
      const userSetup = await runCli(
        ["setup", "--scope", "user", "--agent", "claude-code", "--yes", "--non-interactive"],
        { cwd: workspace.path, env },
      );
      expect(userSetup.exitCode, userSetup.stdout + userSetup.stderr).toBe(0);

      for (const row of EXTENSION_TYPE_MATRIX) {
        const name = extensionName(row.plural);
        const created = await runCli(
          [row.plural, "new", name, "--owner", "@test", "--yes", "--non-interactive"],
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
});
