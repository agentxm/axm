import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { startHttpRegistry } from "./e2e/http-registry-server.js";
import { createTempDir, runCli } from "./e2e/utils.js";

export const specification = defineSpecification({
  requirement: "cli/acquires-content-before-workspace-transition",
  title: "A workspace transition never waits for remote package bytes",
  statement:
    "For an install or configured sync, AXM shall acquire remote package content before holding the workspace transition, so no Registry archive or Git fetch request occurs while that transition is held.",
  class: "functional",
  role: "supporting",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "The real CLI process and controlled Registry and Git transports make each remote request and the on-disk workspace lock observable at the same instant.",
  methods: ["example"],
  derivedFrom: ["docs/architecture/workspace/execution.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const OWNER = "@test";
const TOKEN = "e2e-test-token";
const registryEnv = (): Record<string, string> => ({ AXM_TOKEN: TOKEN });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readSettings = (workspace: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.join(workspace, "axm.json"), "utf8"));
  if (!isRecord(parsed)) throw new Error("Expected workspace settings");
  return parsed;
};

const writeSettings = (workspace: string, settings: Record<string, unknown>): void => {
  fs.writeFileSync(path.join(workspace, "axm.json"), JSON.stringify(settings, null, 2));
};

const initWorkspace = async (workspace: string, location: string) => {
  const setup = await runCli(["setup", "--yes", "--scope", "project", "--agent", "claude-code"], {
    cwd: workspace,
    env: registryEnv(),
  });
  expect(setup.exitCode, setup.stderr).toBe(0);
  const settings = readSettings(workspace);
  settings["defaultRegistry"] = "test";
  settings["sources"] = [{ name: "test", type: "registry", location }];
  settings["owner"] = OWNER;
  settings["minimumReleaseAge"] = "0s";
  writeSettings(workspace, settings);
};

const publishSkill = async (location: string, name: string) => {
  const workspace = createTempDir();
  try {
    await initWorkspace(workspace.path, location);
    const created = await runCli(["skills", "new", name, "--owner", OWNER], {
      cwd: workspace.path,
      env: registryEnv(),
    });
    expect(created.exitCode, created.stderr).toBe(0);
    const published = await runCli(["skills", "publish", `${OWNER}/skills/${name}`], {
      cwd: workspace.path,
      env: registryEnv(),
    });
    expect(published.exitCode, published.stderr).toBe(0);
  } finally {
    workspace.cleanup();
  }
};

const availablePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Expected an allocated TCP port"));
        return;
      }
      server.close((error) => (error === undefined ? resolve(address.port) : reject(error)));
    });
  });

const waitForGitDaemon = (daemon: ChildProcess): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Git fixture did not become ready")), 5_000);
    const ready = (chunk: Buffer) => {
      if (!chunk.toString().includes("Ready to rumble")) return;
      clearTimeout(timeout);
      daemon.stderr?.off("data", ready);
      resolve();
    };
    daemon.stderr?.on("data", ready);
    daemon.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Git fixture exited before readiness with status ${String(code)}`));
    });
  });

const startGitFixture = async (onFetch: () => void) => {
  const fixture = createTempDir();
  const source = path.join(fixture.path, "source");
  const packageRoot = path.join(source, "skill");
  const bare = path.join(fixture.path, "review.git");
  fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "skill.json"),
    JSON.stringify({ owner: OWNER, type: "skill", name: "git-before-lock", version: "1.0.0" }),
  );
  fs.writeFileSync(
    path.join(packageRoot, "src", "SKILL.md"),
    '---\nname: "git-before-lock"\ndescription: "Review source changes."\n---\n\n# Git before lock\n',
  );
  execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: source });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: source });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: source });
  execFileSync("git", ["add", "."], { cwd: source });
  execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: source });
  execFileSync("git", ["clone", "--quiet", "--bare", source, bare]);

  const port = await availablePort();
  const daemon = spawn(
    "git",
    [
      "daemon",
      "--verbose",
      "--reuseaddr",
      "--export-all",
      `--base-path=${fixture.path}`,
      "--listen=127.0.0.1",
      `--port=${String(port)}`,
      fixture.path,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  try {
    await waitForGitDaemon(daemon);
  } catch (cause) {
    daemon.kill();
    fixture.cleanup();
    throw cause;
  }
  let pending = "";
  daemon.stderr?.on("data", (chunk: Buffer) => {
    pending += chunk.toString();
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) if (line.includes("Request upload-pack")) onFetch();
  });
  return {
    url: `git://127.0.0.1:${String(port)}/review.git`,
    cleanup: () => {
      daemon.kill();
      fixture.cleanup();
    },
  };
};

describe("Remote content precedes workspace transition", () => {
  it("acquires an installed archive before holding the workspace transition", async () => {
    const consumer = createTempDir();
    const lockPresentAtArchive: Array<boolean> = [];
    const registry = await startHttpRegistry({
      onArchiveRequest: () =>
        lockPresentAtArchive.push(
          fs.existsSync(path.join(consumer.path, ".axm", "tmp", "workspace-transition.lock")),
        ),
    });
    try {
      await publishSkill(registry.url, "archive-before-lock");
      await initWorkspace(consumer.path, registry.url);
      const result = await runCli(["install", `${OWNER}/skills/archive-before-lock`], {
        cwd: consumer.path,
        env: registryEnv(),
      });
      expect(result.exitCode, result.stderr).toBe(0);
      expect(lockPresentAtArchive).toEqual([false]);
    } finally {
      await registry.close();
      consumer.cleanup();
    }
  });

  it("acquires configured sync archives before holding the workspace transition", async () => {
    const consumer = createTempDir();
    const lockPresentAtArchive: Array<boolean> = [];
    const registry = await startHttpRegistry({
      onArchiveRequest: () =>
        lockPresentAtArchive.push(
          fs.existsSync(path.join(consumer.path, ".axm", "tmp", "workspace-transition.lock")),
        ),
    });
    const names = ["first-sync-source", "second-sync-source", "third-sync-source"];
    try {
      for (const name of names) await publishSkill(registry.url, name);
      await initWorkspace(consumer.path, registry.url);
      const settings = readSettings(consumer.path);
      settings["skills"] = Object.fromEntries(
        names.map((name) => [name, `${OWNER}/skills/${name}`]),
      );
      writeSettings(consumer.path, settings);

      const result = await runCli(["sync"], { cwd: consumer.path, env: registryEnv() });
      expect(result.exitCode, result.stderr).toBe(0);
      expect(lockPresentAtArchive).toEqual([false, false, false]);
    } finally {
      await registry.close();
      consumer.cleanup();
    }
  });

  it("acquires Git content before holding the workspace transition", async () => {
    const consumer = createTempDir();
    const lockPresentAtFetch: Array<boolean> = [];
    const git = await startGitFixture(() =>
      lockPresentAtFetch.push(
        fs.existsSync(path.join(consumer.path, ".axm", "tmp", "workspace-transition.lock")),
      ),
    );
    try {
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code"],
        { cwd: consumer.path },
      );
      expect(setup.exitCode, setup.stderr).toBe(0);
      const result = await runCli(["install", git.url, "--skill", "git-before-lock"], {
        cwd: consumer.path,
      });
      expect(result.exitCode, result.stderr).toBe(0);
      expect(lockPresentAtFetch.length).toBeGreaterThan(0);
      expect(lockPresentAtFetch).toEqual(Array(lockPresentAtFetch.length).fill(false));
    } finally {
      git.cleanup();
      consumer.cleanup();
    }
  });
});
