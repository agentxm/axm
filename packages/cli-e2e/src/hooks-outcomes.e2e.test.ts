import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "./e2e/utils.js";

const writeJson = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const readJson = (filePath: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(filePath, "utf8"));

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const agentOutcomes = (stdout: string): ReadonlyArray<Readonly<Record<string, unknown>>> => {
  const document: unknown = JSON.parse(stdout);
  if (!isRecord(document) || !isRecord(document["result"])) return [];
  const units = document["result"]["units"];
  if (!Array.isArray(units)) return [];
  return units.flatMap((unit) => {
    if (!isRecord(unit) || !isRecord(unit["artifact"])) return [];
    const outcomes = unit["artifact"]["agentOutcomes"];
    return Array.isArray(outcomes) ? outcomes.filter(isRecord) : [];
  });
};

const outcomeDecisions = (stdout: string) =>
  agentOutcomes(stdout).map(({ outcome: _outcome, ...decision }) => decision);

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

const writeHook = (
  root: string,
  name: string,
  bindings: ReadonlyArray<Record<string, unknown>>,
): string => {
  const packageRoot = path.join(root, "fixtures", name);
  writeJson(path.join(packageRoot, "hook.json"), {
    owner: "@test",
    type: "hook",
    name,
    version: "1.0.0",
    runtime: "bash",
    entrypoint: "src/hook.sh",
    bindings,
  });
  fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, "src", "hook.sh"), "#!/usr/bin/env bash\n");
  return packageRoot;
};

describe("hook configured-agent outcomes", () => {
  it("keeps preview pure and aligns install, sync authority, and show output", async () => {
    const temp = createTempDir();
    try {
      const setup = await runCli(
        ["setup", "--scope", "project", "--agent", "claude-code", "--yes", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      writeJson(settingsPath, {
        ...readJson(settingsPath),
        agents: ["claude-code", "windsurf"],
      });
      const observational = writeHook(temp.path, "audit", [{ on: "tool.pre" }]);

      const beforePreview = snapshotTree(temp.path);
      const humanPreview = await runCli(
        ["hooks", "install", observational, "--preview", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(humanPreview.exitCode, humanPreview.stdout + humanPreview.stderr).toBe(0);
      expect(humanPreview.stdout + humanPreview.stderr).toContain("Would install 1 hook");
      expect(humanPreview.stdout + humanPreview.stderr).toContain("1 to apply");
      expect(humanPreview.stdout + humanPreview.stderr).toContain(
        "claude-code: projected (native)",
      );
      expect(humanPreview.stdout + humanPreview.stderr).toContain(
        "windsurf: projected (advisory-fallback)",
      );
      expect(snapshotTree(temp.path)).toEqual(beforePreview);
      const preview = await runCli(
        ["hooks", "install", observational, "--preview", "--json", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(preview.exitCode, preview.stdout + preview.stderr).toBe(0);
      expect(snapshotTree(temp.path)).toEqual(beforePreview);
      expect(JSON.parse(preview.stdout)).toMatchObject({
        ok: true,
        result: { contract: "plan-result-v2", outcome: "previewed", mode: "preview" },
      });
      expect(agentOutcomes(preview.stdout)).toMatchObject([
        { name: "audit", agentId: "claude-code", outcome: "projected", mechanism: "native" },
        {
          name: "audit",
          agentId: "windsurf",
          outcome: "projected",
          mechanism: "advisory-fallback",
        },
      ]);

      const applied = await runCli(
        ["hooks", "install", observational, "--yes", "--json", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(applied.exitCode, applied.stdout + applied.stderr).toBe(0);
      expect(JSON.parse(applied.stdout)).toMatchObject({
        ok: true,
        result: {
          contract: "plan-result-v2",
          outcome: "applied",
          mode: "apply",
          counts: { total: 1, committed: 1, failed: 0, blocked: 0 },
        },
      });
      expect(agentOutcomes(applied.stdout)).toMatchObject([
        { name: "audit", agentId: "claude-code", outcome: "current", mechanism: "native" },
        {
          name: "audit",
          agentId: "windsurf",
          outcome: "current",
          mechanism: "advisory-fallback",
        },
      ]);
      expect(outcomeDecisions(applied.stdout)).toEqual(outcomeDecisions(preview.stdout));
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).toContain(
        "managed advisory rule",
      );

      const show = await runCli(["hooks", "show", "audit", "--json"], { cwd: temp.path });
      expect(show.exitCode, show.stdout + show.stderr).toBe(0);
      const shown: unknown = JSON.parse(show.stdout);
      expect(shown).toMatchObject({
        result: {
          agents: [
            { agent: "claude-code", status: "current", reason: expect.stringContaining("native") },
            {
              agent: "windsurf",
              status: "current",
              reason: expect.stringContaining("advisory-fallback"),
            },
          ],
        },
      });
      const humanShow = await runCli(["hooks", "show", "audit"], { cwd: temp.path });
      expect(humanShow.exitCode, humanShow.stdout + humanShow.stderr).toBe(0);
      expect(humanShow.stdout + humanShow.stderr).toContain("advisory-fallback");

      fs.rmSync(path.join(temp.path, ".claude", "settings.json"));
      const beforeSyncPreview = snapshotTree(temp.path);
      const humanSyncPreview = await runCli(["sync", "--preview", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(humanSyncPreview.exitCode, humanSyncPreview.stdout + humanSyncPreview.stderr).toBe(0);
      expect(humanSyncPreview.stdout + humanSyncPreview.stderr).toContain(
        "claude-code: projected (native)",
      );
      expect(humanSyncPreview.stdout + humanSyncPreview.stderr).toContain(
        "windsurf: projected (advisory-fallback)",
      );
      expect(snapshotTree(temp.path)).toEqual(beforeSyncPreview);
      const syncPreview = await runCli(["sync", "--preview", "--json", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(syncPreview.exitCode, syncPreview.stdout + syncPreview.stderr).toBe(0);
      expect(snapshotTree(temp.path)).toEqual(beforeSyncPreview);
      expect(outcomeDecisions(syncPreview.stdout)).toEqual(outcomeDecisions(preview.stdout));

      const syncApply = await runCli(["sync", "--json", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(syncApply.exitCode, syncApply.stdout + syncApply.stderr).toBe(0);
      expect(agentOutcomes(syncApply.stdout).every(({ outcome }) => outcome === "current")).toBe(
        true,
      );
      expect(outcomeDecisions(syncApply.stdout)).toEqual(outcomeDecisions(syncPreview.stdout));

      const blocked = writeHook(temp.path, "enforce", [
        { on: "tool.pre", requires: { decision: { kind: "block" } } },
      ]);
      const beforeBlocked = snapshotTree(temp.path);
      const blockedApply = await runCli(
        ["hooks", "install", blocked, "--yes", "--json", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(blockedApply.exitCode, blockedApply.stdout + blockedApply.stderr).toBe(6);
      expect(JSON.parse(blockedApply.stdout)).toMatchObject({
        ok: false,
        result: {
          contract: "plan-result-v2",
          outcome: "blocked",
          blocking: { class: "precondition-unmet", subject: "hook:enforce" },
          counts: { committed: 0 },
        },
      });
      expect(agentOutcomes(blockedApply.stdout)).toContainEqual(
        expect.objectContaining({ name: "enforce", agentId: "windsurf", outcome: "blocked" }),
      );
      expect(snapshotTree(temp.path)).toEqual(beforeBlocked);
    } finally {
      temp.cleanup();
    }
  }, 120_000);
});
