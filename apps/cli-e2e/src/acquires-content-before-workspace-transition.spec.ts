import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { startHttpRegistry } from "./e2e/http-registry-server.js";
import { createTempDir, runCli } from "./e2e/utils.js";

export const specification = defineSpecification({
  requirement: "cli/acquires-content-before-workspace-transition",
  title: "A workspace transition never waits for remote package bytes",
  statement:
    "For an install or configured sync, AXM shall acquire remote package content before holding the workspace transition, so no Registry archive request occurs while that transition is held.",
  class: "functional",
  role: "supporting",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "The real CLI process and HTTP transport make both the archive request and on-disk workspace lock observable at the same instant.",
  methods: ["example"],
  derivedFrom: ["docs/architecture/workspace/execution.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation: "The fixture covers Registry archives; Git transport is verified separately.",
      retirementCondition:
        "A Git process fixture observes network activity against the workspace transition.",
    },
  ],
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
});
