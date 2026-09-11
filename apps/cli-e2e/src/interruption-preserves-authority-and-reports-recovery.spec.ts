import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { startHttpRegistry } from "./e2e/http-registry-server.js";
import { interruptOnFirstRegistryRequest, runCliUntil } from "./e2e/interruption.js";
import { createTempDir, runCli } from "./e2e/utils.js";

export const specification = defineSpecification({
  requirement: "cli/interruption-preserves-authority-and-reports-recovery",
  title: "An interrupted workspace change leaves authoritative files whole and names a way back",
  statement:
    "When a workspace change is interrupted, AXM shall leave every authoritative file either wholly as it was or wholly as committed, shall keep closures that had settled committed and restore closures in flight when it can, and shall report the interruption with each unit's disposition and a recovery route, without promising to finish, resume, or roll back the interrupted request.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "Signal delivery, atomic replacement, and lock reclamation are process and filesystem facts an in-memory port cannot establish.",
  methods: ["example"],
  derivedFrom: [
    "cli/mutations-are-closure-atomic",
    "docs/architecture/workspace/execution.md",
    "docs/architecture/decisions/closure-atomicity-and-recovery.md",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const OWNER = "@test";
const TOKEN = "e2e-test-token";

const registryEnv = (location: string): Record<string, string> => ({
  AXM_REGISTRY_URL: location,
  AXM_TOKEN: TOKEN,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readSettings = (workspace: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.join(workspace, "axm.json"), "utf-8"));
  if (!isRecord(parsed)) throw new Error("axm.json is not an object");
  return parsed;
};

/** The `result` payload of a machine document, or a failure naming what was missing. */
const machineResult = (stdout: string): Record<string, unknown> => {
  const document: unknown = JSON.parse(stdout);
  if (!isRecord(document) || !isRecord(document["result"])) {
    throw new Error(`Expected a machine result document, received: ${stdout}`);
  }
  return document["result"];
};

/** The recovery block a retained interruption reports. */
const recoveryOf = (
  result: Record<string, unknown>,
): {
  readonly retained: ReadonlyArray<unknown>;
  readonly actions: ReadonlyArray<Record<string, unknown>>;
} => {
  const recovery = result["recovery"];
  if (!isRecord(recovery)) throw new Error("Expected a recovery block");
  const retained = recovery["retained"];
  const actions = recovery["actions"];
  if (!Array.isArray(retained) || !Array.isArray(actions)) {
    throw new Error("Expected retained paths and recovery actions");
  }
  return { retained, actions: actions.filter(isRecord) };
};

const writeSettings = (workspace: string, value: Record<string, unknown>): void => {
  fs.writeFileSync(path.join(workspace, "axm.json"), `${JSON.stringify(value, null, 2)}\n`);
};

const initWorkspace = async (workspace: string, location: string) => {
  const setup = await runCli(["setup", "--yes", "--scope", "project", "--agent", "claude-code"], {
    cwd: workspace,
    env: registryEnv(location),
  });
  expect(setup.exitCode, setup.stderr).toBe(0);
  const settings = readSettings(workspace);
  settings["sources"] = [{ name: "agentxm", type: "registry", location }];
  settings["owner"] = OWNER;
  settings["minimumReleaseAge"] = "0s";
  writeSettings(workspace, settings);
};

/** Scaffold and publish one skill into the HTTP registry. */
const publishSkill = async (location: string, name: string) => {
  const workspace = createTempDir();
  try {
    await initWorkspace(workspace.path, location);
    const created = await runCli(["skills", "new", name, "--owner", OWNER], {
      cwd: workspace.path,
      env: registryEnv(location),
    });
    expect(created.exitCode, created.stderr).toBe(0);
    const published = await runCli(["skills", "publish", `${OWNER}/skills/${name}`], {
      cwd: workspace.path,
      env: registryEnv(location),
    });
    expect(published.exitCode, published.stderr).toBe(0);
  } finally {
    workspace.cleanup();
  }
};

describe("An interrupted workspace change", () => {
  it("leaves the workspace untouched when the signal lands before the first write", async () => {
    const workspace = createTempDir();
    const userHome = createTempDir();
    try {
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code"],
        { cwd: workspace.path },
      );
      expect(setup.exitCode, setup.stderr).toBe(0);
      const before = readSettings(workspace.path);

      const result = await interruptOnFirstRegistryRequest(
        ["install", `${OWNER}/skills/interrupt`, "--json"],
        { cwd: workspace.path, userHome: userHome.path },
      );

      expect(result.code, result.stdout + result.stderr).toBe(130);
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        result: {
          contract: "plan-result-v3",
          outcome: "interrupted",
          interruption: { signal: "SIGINT", disposition: "none" },
        },
      });
      expect(readSettings(workspace.path)).toEqual(before);
      expect(fs.existsSync(path.join(workspace.path, ".axm", "tmp"))).toBe(false);
    } finally {
      userHome.cleanup();
      workspace.cleanup();
    }
  });

  it("keeps a settled closure committed, names what it retained, and converges on a rerun", async () => {
    // `beta`'s archive download is accepted and never answered, so the signal
    // lands during apply, after `alpha`'s closure has already settled.
    const registry = await startHttpRegistry({ hangArchive: ["skills/beta"] });
    const workspace = createTempDir();
    const userHome = createTempDir();
    try {
      await publishSkill(registry.url, "alpha");
      await publishSkill(registry.url, "beta");
      await initWorkspace(workspace.path, registry.url);
      const settings = readSettings(workspace.path);
      settings["skills"] = {
        alpha: `${OWNER}/skills/alpha`,
        beta: `${OWNER}/skills/beta`,
      };
      writeSettings(workspace.path, settings);

      const interrupted = await runCliUntil(["sync", "--json"], {
        cwd: workspace.path,
        userHome: userHome.path,
        env: registryEnv(registry.url),
        signalWhen: registry.nextHungArchive(),
        signal: "SIGTERM",
      });

      expect(interrupted.code, interrupted.stdout + interrupted.stderr).toBe(143);
      expect(JSON.parse(interrupted.stdout)).toMatchObject({
        ok: false,
        result: {
          contract: "plan-result-v3",
          outcome: "interrupted",
          interruption: { signal: "SIGTERM", disposition: "retained" },
        },
      });
      const recovery = recoveryOf(machineResult(interrupted.stdout));
      expect(recovery.retained.length).toBeGreaterThan(0);
      expect(recovery.actions[0]?.["description"]).toContain("Re-run the command");
      // The settled closure's content is on disk; the interrupted one is not.
      expect(fs.existsSync(path.join(workspace.path, ".agents", "skills", "alpha"))).toBe(true);
      expect(fs.existsSync(path.join(workspace.path, ".agents", "skills", "beta"))).toBe(false);

      // Nothing promised the request would finish; the next ordinary run does.
      registry.resumeArchive("skills/beta");
      const rerun = await runCli(["sync", "--json"], {
        cwd: workspace.path,
        env: registryEnv(registry.url),
      });
      expect(rerun.exitCode, rerun.stdout + rerun.stderr).toBe(0);
      expect(fs.existsSync(path.join(workspace.path, ".agents", "skills", "beta"))).toBe(true);
    } finally {
      userHome.cleanup();
      workspace.cleanup();
      await registry.close();
    }
  });

  it("restores the prior tree when a canonical replacement did not finish", async () => {
    const registry = await startHttpRegistry({});
    const workspace = createTempDir();
    try {
      await publishSkill(registry.url, "alpha");
      await initWorkspace(workspace.path, registry.url);
      const installed = await runCli(["install", `${OWNER}/skills/alpha`], {
        cwd: workspace.path,
        env: registryEnv(registry.url),
      });
      expect(installed.exitCode, installed.stderr).toBe(0);

      const canonical = path.join(
        workspace.path,
        "agent_extensions",
        "agentxm",
        OWNER,
        "skills",
        "alpha",
      );
      expect(fs.existsSync(canonical)).toBe(true);
      const priorTree = fs.readFileSync(path.join(canonical, "src", "SKILL.md"), "utf-8");
      const settingsBefore = fs.readFileSync(path.join(workspace.path, "axm.json"), "utf-8");
      const lockBefore = fs.readFileSync(path.join(workspace.path, "axm-lock.yaml"), "utf-8");

      // The state a process killed between the two renames leaves behind: the
      // prior tree is in the sibling backup, a half-filled staging directory
      // survives, and the canonical path is gone.
      fs.renameSync(canonical, `${canonical}.axm-backup`);
      fs.mkdirSync(path.join(`${canonical}.axm-staging`, "src"), { recursive: true });
      fs.writeFileSync(path.join(`${canonical}.axm-staging`, "src", "SKILL.md"), "half-written\n");

      const recovered = await runCli(["sync", "--json"], {
        cwd: workspace.path,
        env: registryEnv(registry.url),
      });
      expect(recovered.exitCode, recovered.stderr).toBe(0);

      expect(fs.readFileSync(path.join(canonical, "src", "SKILL.md"), "utf-8")).toBe(priorTree);
      expect(fs.existsSync(`${canonical}.axm-staging`)).toBe(false);
      expect(fs.existsSync(`${canonical}.axm-backup`)).toBe(false);
      expect(fs.readFileSync(path.join(workspace.path, "axm.json"), "utf-8")).toBe(settingsBefore);
      expect(fs.readFileSync(path.join(workspace.path, "axm-lock.yaml"), "utf-8")).toBe(lockBefore);
    } finally {
      workspace.cleanup();
      await registry.close();
    }
  });

  it("reclaims a workspace transition a dead process was holding", async () => {
    const registry = await startHttpRegistry({});
    const workspace = createTempDir();
    try {
      await publishSkill(registry.url, "alpha");
      await initWorkspace(workspace.path, registry.url);

      // The lock a killed process left: its directory and holder metadata are
      // still there, and its timestamp is older than the staleness window.
      const lockDir = path.join(workspace.path, ".axm", "tmp", "workspace-transition.lock");
      fs.mkdirSync(lockDir, { recursive: true });
      fs.writeFileSync(
        path.join(lockDir, "holder.json"),
        JSON.stringify({ pid: 999_999, startedAt: "2020-01-01T00:00:00.000Z" }),
      );
      const stale = new Date(Date.now() - 120_000);
      fs.utimesSync(lockDir, stale, stale);

      const proceeded = await runCli(["install", `${OWNER}/skills/alpha`, "--json"], {
        cwd: workspace.path,
        env: registryEnv(registry.url),
      });

      expect(proceeded.exitCode, proceeded.stdout + proceeded.stderr).toBe(0);
      expect(
        fs.existsSync(
          path.join(workspace.path, "agent_extensions", "agentxm", OWNER, "skills", "alpha"),
        ),
      ).toBe(true);
    } finally {
      workspace.cleanup();
      await registry.close();
    }
  });
});
