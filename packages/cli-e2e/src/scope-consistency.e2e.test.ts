import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { createTempDir, runCli } from "./e2e/utils.js";

const OWNER = "@test";
const PACK = "scope-pack";
const SUBAGENT = "scope-subagent";

const configureRegistry = (settingsPath: string, registryPath: string) => {
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  settings.owner = OWNER;
  settings.sources = [{ name: "local", type: "registry", location: `file://${registryPath}` }];
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
};

describe("installed-state scope consistency", () => {
  it("keeps status and pack show/unpack isolated to user scope", async () => {
    const author = createTempDir("axm-scope-author-");
    const consumer = createTempDir("axm-scope-consumer-");
    const userHome = createTempDir("axm-scope-user-");
    const registry = createTempDir("axm-scope-registry-");
    const env = { AXM_USER_HOME: userHome.path, HOME: userHome.path };

    try {
      const authorSetup = await runCli(["setup", "--yes", "--non-interactive"], {
        cwd: author.path,
      });
      expect(authorSetup.exitCode, `${authorSetup.stderr}\n${authorSetup.stdout}`).toBe(0);
      configureRegistry(path.join(author.path, ".axm", "settings.json"), registry.path);

      const created = await runCli(["packs", "new", PACK, "--owner", OWNER, "--yes"], {
        cwd: author.path,
      });
      expect(created.exitCode, `${created.stderr}\n${created.stdout}`).toBe(0);
      const published = await runCli(["packs", "publish", `${OWNER}/packs/${PACK}`, "--yes"], {
        cwd: author.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });
      expect(published.exitCode, `${published.stderr}\n${published.stdout}`).toBe(0);
      const subagentCreated = await runCli(
        ["subagents", "new", SUBAGENT, "--owner", OWNER, "--yes"],
        { cwd: author.path },
      );
      expect(subagentCreated.exitCode, `${subagentCreated.stderr}\n${subagentCreated.stdout}`).toBe(
        0,
      );
      const subagentPublished = await runCli(
        ["subagents", "publish", `${OWNER}/subagents/${SUBAGENT}`, "--yes"],
        { cwd: author.path, env: { AXM_TOKEN: "e2e-test-token" } },
      );
      expect(
        subagentPublished.exitCode,
        `${subagentPublished.stderr}\n${subagentPublished.stdout}`,
      ).toBe(0);

      const projectSetup = await runCli(["setup", "--yes", "--non-interactive"], {
        cwd: consumer.path,
        env,
      });
      expect(projectSetup.exitCode, `${projectSetup.stderr}\n${projectSetup.stdout}`).toBe(0);
      const projectSettingsPath = path.join(consumer.path, ".axm", "settings.json");
      const projectSettings = fs.readFileSync(projectSettingsPath, "utf-8");

      const userSetup = await runCli(
        ["setup", "--scope", "user", "--agent", "cursor", "--yes", "--non-interactive"],
        { cwd: consumer.path, env },
      );
      expect(userSetup.exitCode, `${userSetup.stderr}\n${userSetup.stdout}`).toBe(0);
      const userSettingsPath = path.join(userHome.path, ".axm", "settings.json");
      configureRegistry(userSettingsPath, registry.path);

      const missingAgent = await runCli(
        ["agents", "remove", "cursor", "codex", "--scope", "user", "--yes"],
        { cwd: consumer.path, env },
      );
      expect(missingAgent.exitCode).not.toBe(0);
      expect(`${missingAgent.stderr}\n${missingAgent.stdout}`).toContain(
        "axm agents list --scope user",
      );

      const userSettingsBeforeRefusal = fs.readFileSync(userSettingsPath, "utf-8");
      const refused = await runCli(
        ["subagents", "install", `${OWNER}/subagents/${SUBAGENT}`, "--scope", "user", "--yes"],
        { cwd: consumer.path, env },
      );
      expect(refused.exitCode).not.toBe(0);
      expect(`${refused.stderr}\n${refused.stdout}`).toContain(
        "supports user-scope subagents natively but AXM has not modeled that location",
      );
      expect(fs.readFileSync(userSettingsPath, "utf-8")).toBe(userSettingsBeforeRefusal);
      expect(
        fs.existsSync(path.join(userHome.path, ".axm", "extensions", OWNER, "subagents", SUBAGENT)),
      ).toBe(false);

      const installed = await runCli(
        ["packs", "install", `${OWNER}/packs/${PACK}`, "--scope", "user", "--yes"],
        { cwd: consumer.path, env },
      );
      expect(installed.exitCode, `${installed.stderr}\n${installed.stdout}`).toBe(0);
      expect(`${installed.stderr}\n${installed.stdout}`).toContain("axm packs list --scope user");

      const shown = await runCli(["packs", "show", PACK, "--scope", "user", "--json"], {
        cwd: consumer.path,
        env,
      });
      expect(shown.exitCode, `${shown.stderr}\n${shown.stdout}`).toBe(0);
      expect(JSON.parse(shown.stdout)).toMatchObject({
        ok: true,
        result: { scope: "user", pack: `${OWNER}/packs/${PACK}` },
      });

      const status = await runCli(["status", "--scope", "user", "--json"], {
        cwd: consumer.path,
        env,
      });
      expect(status.exitCode, `${status.stderr}\n${status.stdout}`).toBe(0);
      expect(JSON.parse(status.stdout)).toMatchObject({
        ok: true,
        result: { scope: "user" },
      });

      const linted = await runCli(["lint", "--scope", "user", "--json"], {
        cwd: consumer.path,
        env,
      });
      expect(linted.exitCode, `${linted.stderr}\n${linted.stdout}`).toBe(0);
      expect(fs.readFileSync(projectSettingsPath, "utf-8")).toBe(projectSettings);

      const unpacked = await runCli(
        ["packs", "unpack", PACK, "--scope", "user", "--yes", "--json"],
        { cwd: consumer.path, env },
      );
      expect(unpacked.exitCode, `${unpacked.stderr}\n${unpacked.stdout}`).toBe(0);
      expect(fs.readFileSync(projectSettingsPath, "utf-8")).toBe(projectSettings);

      const userSettings = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
      expect(userSettings.packs ?? {}).not.toHaveProperty(PACK);
    } finally {
      author.cleanup();
      consumer.cleanup();
      userHome.cleanup();
      registry.cleanup();
    }
  });
});
