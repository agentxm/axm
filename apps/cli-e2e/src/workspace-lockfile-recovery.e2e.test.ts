/** Process-boundary evidence that the rejected-lockfile recovery route converges. */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

import { startHttpRegistry, type HttpRegistry } from "./e2e/http-registry-server.js";
import { createTempDir, runCli } from "./e2e/utils.js";
import { initWorkspace } from "./test-support/published-registry.js";

export const executionBinding = {
  requirements: ["cli/lockfile-rejections-name-recovery-routes"],
  boundary: "process",
  rationale:
    "Runs the four steps the shipped rejection suggests verbatim through the real CLI process against an HTTP Registry — back up and remove the older lockfile, axm sync --preview, axm sync — and proves the workspace converges: a current-version lockfile accepts the shared Pack member at the direct pin every Pack admits, records the disabled MCP connection, and lint reports no findings.",
} as const;

const OWNER = "@test";
const TOKEN = "e2e-test-token";

/**
 * The shared-member scenario, restated at the process boundary: two Packs
 * require one skill with broad ranges, the workspace pins it directly inside
 * both, and one MCP connection is declared but disabled. cli-e2e has no code
 * dependency on the product libraries, so the data is written here.
 */
const MEMBER = { name: "review", fqn: `${OWNER}/skills/review` } as const;
const MEMBER_VERSIONS = ["1.0.0", "1.1.0", "1.2.0", "2.0.0"] as const;
const MEMBER_PIN = "1.1.0";
const PACKS = [
  { name: "alpha", range: "^1.0.0" },
  { name: "beta", range: ">=1.0.0 <2.0.0" },
] as const;
const DISABLED_MCP = { name: "offline-search", fqn: `${OWNER}/mcps/offline-search` } as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readJson = (file: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!isRecord(parsed)) throw new Error(`Expected a JSON object in ${file}`);
  return parsed;
};

const writeJson = (file: string, value: unknown): void =>
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

const expectSuccess = (result: { exitCode: number; stdout: string; stderr: string }): void => {
  expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
};

/** Author every scenario package and publish it through the CLI's HTTP publish path. */
const publishScenario = async (registry: HttpRegistry): Promise<void> => {
  const publisher = createTempDir("axm-recovery-publisher-");
  const env = { AXM_TOKEN: TOKEN };
  const run = (args: ReadonlyArray<string>) => runCli(args, { cwd: publisher.path, env });
  try {
    await initWorkspace(publisher.path, registry.url, OWNER);

    expectSuccess(await run(["skills", "new", MEMBER.name, "--owner", OWNER]));
    const skillManifest = path.join(publisher.path, "skills", MEMBER.name, "skill.json");
    writeJson(skillManifest, { ...readJson(skillManifest), version: MEMBER_VERSIONS[0] });

    for (const pack of PACKS) {
      expectSuccess(await run(["packs", "new", pack.name, "--owner", OWNER]));
      const packManifest = path.join(publisher.path, "packs", pack.name, "pack.json");
      writeJson(packManifest, {
        ...readJson(packManifest),
        version: "1.0.0",
        dependencies: { [MEMBER.fqn]: pack.range },
      });
    }

    expectSuccess(await run(["mcps", "new", DISABLED_MCP.name, "--owner", OWNER]));
    const mcpManifest = path.join(publisher.path, "mcps", DISABLED_MCP.name, "mcp.json");
    writeJson(mcpManifest, {
      ...readJson(mcpManifest),
      version: "1.0.0",
      server: {
        name: `io.agentxm.test/${DISABLED_MCP.name}`,
        description: "An offline search server the workspace keeps disabled",
        version: "1.0.0",
        packages: [
          {
            registryType: "npm",
            identifier: `${OWNER}/${DISABLED_MCP.name}`,
            version: "1.0.0",
            transport: { type: "stdio" },
          },
        ],
      },
    });
    // The harness admits a Pack only in the same publication set as the
    // members it requires, so one root publish carries every package.
    expectSuccess(await run(["publish", "--owner", OWNER, "--json"]));
    for (const version of MEMBER_VERSIONS.slice(1)) {
      registry.copyVersion(OWNER, "skills", MEMBER.name, MEMBER_VERSIONS[0], version);
    }
  } finally {
    publisher.cleanup();
  }
};

describe("rejected lockfile recovery", () => {
  it("converges when the suggested route is followed verbatim", async () => {
    const registry = await startHttpRegistry();
    const workspace = createTempDir("axm-recovery-workspace-");
    const backup = createTempDir("axm-recovery-backup-");
    const userHome = createTempDir("axm-recovery-home-");
    const env = { HOME: userHome.path, AXM_USER_HOME: userHome.path, AXM_TOKEN: TOKEN };
    const run = (args: ReadonlyArray<string>) => runCli(args, { cwd: workspace.path, env });
    try {
      await publishScenario(registry);
      expectSuccess(await run(["setup", "--scope", "project", "--agent", "claude-code", "--yes"]));
      const settingsPath = path.join(workspace.path, "axm.json");
      const setupSettings = readJson(settingsPath);
      const setupSkills = isRecord(setupSettings["skills"]) ? setupSettings["skills"] : {};
      writeJson(settingsPath, {
        ...setupSettings,
        owner: OWNER,
        defaultRegistry: "test",
        sources: [{ name: "test", type: "registry", location: registry.url }],
        minimumReleaseAge: "0s",
        skills: { ...setupSkills, [MEMBER.name]: `${MEMBER.fqn}@${MEMBER_PIN}` },
        packs: Object.fromEntries(PACKS.map((pack) => [pack.name, `${OWNER}/packs/${pack.name}`])),
        mcpServers: { [DISABLED_MCP.name]: { source: DISABLED_MCP.fqn, enabled: false } },
      });
      const lockPath = path.join(workspace.path, "axm-lock.yaml");
      fs.writeFileSync(lockPath, "lockfileVersion: 7\nskills: {}\n");

      const rejected = await run(["list", "--json"]);
      expect(rejected.exitCode, rejected.stdout + rejected.stderr).toBe(9);
      const rejection = JSON.parse(rejected.stdout);
      expect(rejection).toMatchObject({
        ok: false,
        problem: {
          code: "workspace-lockfile-version-unsupported",
          observedVersion: 7,
          supportedVersion: 9,
          direction: "older",
        },
      });
      expect(
        rejection.suggestions.flatMap((suggestion: { cmd?: string }) =>
          suggestion.cmd === undefined ? [] : [suggestion.cmd],
        ),
      ).toEqual(["axm sync --preview", "axm sync"]);

      // Back up the incompatible lockfile outside the workspace, then remove it.
      const backupPath = path.join(backup.path, "axm-lock.yaml");
      fs.copyFileSync(lockPath, backupPath);
      fs.rmSync(lockPath);

      expectSuccess(await run(["sync", "--preview", "--json"]));
      expect(fs.existsSync(lockPath)).toBe(false);
      expectSuccess(await run(["sync", "--json"]));

      const lockfile: unknown = YAML.parse(fs.readFileSync(lockPath, "utf8"));
      expect(lockfile).toMatchObject({
        lockfileVersion: 9,
        skills: { [MEMBER.name]: { resolved: { version: MEMBER_PIN } } },
      });
      // The disabled connection is still accepted: its row is keyed by the
      // Registry-qualified identity, so it is found by its identity fields.
      expect(
        isRecord(lockfile) && isRecord(lockfile["mcpServers"])
          ? Object.values(lockfile["mcpServers"])
          : [],
      ).toContainEqual(
        expect.objectContaining({
          identity: { owner: OWNER, name: DISABLED_MCP.name },
          resolved: expect.objectContaining({ version: "1.0.0" }),
        }),
      );
      expect(fs.readFileSync(backupPath, "utf8")).toContain("lockfileVersion: 7");

      const lint = await run(["lint", "--json"]);
      expectSuccess(lint);
      expect(JSON.parse(lint.stdout)).toMatchObject({ ok: true, result: { findings: [] } });
    } finally {
      await registry.close();
      workspace.cleanup();
      backup.cleanup();
      userHome.cleanup();
    }
  });
});
