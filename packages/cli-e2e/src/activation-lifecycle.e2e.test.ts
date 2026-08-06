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
        const confirmation = row.type === "knowledge" ? [] : ["--yes"];
        const disabled = await runCli(
          [row.plural, "disable", name, ...confirmation, "--non-interactive"],
          { cwd: temp.path },
        );
        expect(disabled.exitCode, `disable ${row.type}\n${disabled.stdout}${disabled.stderr}`).toBe(
          0,
        );
        expect(
          fs.existsSync(canonicalDirectory(temp.path, row.plural)),
          `${row.type} canonical package retained after disable`,
        ).toBe(true);
        await expectCleanWorkspace(temp.path, `${row.type} disabled`);

        const enabled = await runCli(
          [row.plural, "enable", name, ...confirmation, "--non-interactive"],
          { cwd: temp.path },
        );
        expect(enabled.exitCode, `enable ${row.type}\n${enabled.stdout}${enabled.stderr}`).toBe(0);
        await expectCleanWorkspace(temp.path, `${row.type} re-enabled`);
      }
    } finally {
      temp.cleanup();
    }
  }, 90_000);
});
