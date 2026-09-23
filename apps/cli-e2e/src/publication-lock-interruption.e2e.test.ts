import * as fs from "node:fs";
import { hostname } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { runCliUntil, waitForPublicationWaiter } from "./e2e/interruption.js";
import { createTempDir, runCli } from "./e2e/utils.js";

export const executionBinding = {
  requirements: [
    "registry/local-publication-coordinates-owners",
    "cli/interruption-preserves-authority-and-reports-recovery",
  ],
  boundary: "process",
  rationale:
    "A real CLI publisher waits on a native lock owned by the live test process. SIGINT must exit after cleaning only the waiting publisher's staged state, preserve the owner's bytes and existing publication, and permit a later invocation after release.",
} as const;

describe("publication lock interruption", () => {
  it("SIGINT cleans a publication waiter before exit and preserves its live owner", async () => {
    const workspace = createTempDir();
    const userHome = createTempDir();
    const registry = createTempDir();
    const env = {
      HOME: userHome.path,
      AXM_USER_HOME: userHome.path,
      AXM_TOKEN: "e2e-test-token",
      NO_COLOR: "1",
    };
    const args = ["skills", "publish", "@test/skills/shared", "--json"];
    try {
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: workspace.path, env, timeout: 30_000 },
      );
      expect(setup.exitCode, setup.stderr).toBe(0);
      const settingsPath = path.join(workspace.path, "axm.json");
      const existing: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (typeof existing !== "object" || existing === null || Array.isArray(existing))
        throw new Error("Expected workspace settings object");
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({
          ...existing,
          defaultRegistry: "test",
          sources: [
            { name: "test", type: "registry", location: pathToFileURL(registry.path).href },
          ],
          owner: "@test",
          skills: { shared: "workspace" },
        }),
      );
      const authored = path.join(workspace.path, "skills", "shared");
      fs.mkdirSync(path.join(authored, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(authored, "src", "SKILL.md"),
        '---\nname: "shared"\ndescription: "A publication interruption fixture"\n---\n\n# Shared\n',
      );
      const manifestPath = path.join(authored, "skill.json");
      const manifest = { owner: "@test", type: "skill", name: "shared", version: "1.0.0" };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      const initial = await runCli(args, { cwd: workspace.path, env, timeout: 30_000 });
      expect(initial.exitCode, initial.stdout + initial.stderr).toBe(0);

      const directory = path.join(registry.path, "extensions", "@test", "skills", "shared");
      const lockPath = path.join(directory, ".publish.lock");
      const indexPath = path.join(directory, "index.json");
      const indexBefore = fs.readFileSync(indexPath, "utf8");
      const archiveBefore = fs.readFileSync(path.join(directory, "1.0.0.zip"));
      const owner = JSON.stringify({
        token: globalThis.crypto.randomUUID(),
        pid: process.pid,
        host: hostname(),
        acquiredAt: Date.now(),
      });
      fs.writeFileSync(lockPath, owner, { flag: "wx" });
      fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, version: "1.1.0" }));
      const cancelled = await runCliUntil(args, {
        cwd: workspace.path,
        userHome: userHome.path,
        env,
        signal: "SIGINT",
        signalWhen: waitForPublicationWaiter(directory),
      });
      expect(cancelled.code, cancelled.stdout + cancelled.stderr).toBe(130);
      expect(fs.readFileSync(lockPath, "utf8")).toBe(owner);
      expect(fs.readFileSync(indexPath, "utf8")).toBe(indexBefore);
      expect(fs.readFileSync(path.join(directory, "1.0.0.zip"))).toEqual(archiveBefore);
      expect(fs.readdirSync(directory).sort()).toEqual([
        ".publish.lock",
        "1.0.0.zip",
        "index.json",
      ]);

      fs.rmSync(lockPath);
      const next = await runCli(args, { cwd: workspace.path, env, timeout: 30_000 });
      expect(next.exitCode, next.stdout + next.stderr).toBe(0);
      expect(fs.readdirSync(directory).sort()).toEqual(["1.0.0.zip", "1.1.0.zip", "index.json"]);
      expect(fs.readFileSync(indexPath, "utf8")).toContain('"1.1.0"');
    } finally {
      registry.cleanup();
      userHome.cleanup();
      workspace.cleanup();
    }
  }, 120_000);
});
