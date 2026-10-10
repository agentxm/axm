import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { snapshotTree } from "@agentxm/test-support";
import { createTempDir, runCli } from "./e2e/utils.js";

export const executionBinding = {
  requirements: [
    "cli/root-activation-accepts-unversioned-fqns",
    "cli/enable/preview-is-pure",
    "cli/disable/preview-is-pure",
  ],
  boundary: "process",
  rationale:
    "Runs the built CLI to exercise root FQN activation for all seven extension types, inspect settings after apply, and prove preview and invalid-grammar refusal write nothing.",
} as const;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const types = [
  { group: "skills", key: "skills" },
  { group: "subagents", key: "subagents" },
  { group: "mcps", key: "mcpServers" },
  { group: "rules", key: "rules" },
  { group: "hooks", key: "hooks" },
  { group: "knowledge", key: "knowledge" },
  { group: "packs", key: "packs" },
] as const;

describe("Root enable and disable", () => {
  it.each(types)("activates $group by FQN through the real runtime", async ({ group, key }) => {
    const workspace = createTempDir();
    const settingsPath = path.join(workspace.path, "axm.json");
    const run = async (args: ReadonlyArray<string>) => {
      const result = await runCli([...args, "--json", "--non-interactive"], {
        cwd: workspace.path,
      });
      expect(result.exitCode, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(0);
      return result;
    };
    try {
      await run(["setup", "--yes", "--scope", "project", "--agent", "claude-code"]);
      const settings: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (typeof settings !== "object" || settings === null || Array.isArray(settings))
        throw new Error("Expected workspace settings");
      fs.writeFileSync(settingsPath, JSON.stringify({ ...settings, owner: "@acme" }));
      await run([
        group,
        "new",
        "example",
        "--owner",
        "@acme",
        "--description",
        "Root activation fixture",
      ]);
      const fqn = `@acme/${group}/example`;
      for (const verb of ["disable", "enable"] as const) {
        const before = snapshotTree(workspace.path);
        await run([verb, "--preview", fqn]);
        expect(snapshotTree(workspace.path)).toEqual(before);
        await run([verb, fqn]);
        const updated: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        if (!isRecord(updated)) throw new Error("Expected updated workspace settings");
        const entries = updated[key];
        if (!isRecord(entries)) throw new Error("Expected configured type entries");
        const entry = entries["example"];
        if (typeof entry === "string") {
          expect(verb).toBe("enable");
          expect(entry).toBe("workspace");
        } else {
          if (!isRecord(entry)) throw new Error("Expected configured extension");
          expect(entry["enabled"] ?? true).toBe(verb === "enable");
        }
      }
    } finally {
      workspace.cleanup();
    }
  });

  for (const verb of ["enable", "disable"] as const)
    it.each(["example", "@acme/skills/example@1.0.0", "@acme/skills/example@"])(
      `${verb} rejects %s before workspace validation`,
      async (target) => {
        const workspace = createTempDir();
        const settingsPath = path.join(workspace.path, "axm.json");
        const settings = "invalid settings must not outrank target validation\n";
        try {
          fs.writeFileSync(settingsPath, settings);
          const result = await runCli([verb, target, "--json"], { cwd: workspace.path });
          const document: unknown = JSON.parse(result.stdout);
          expect(result.exitCode).toBe(2);
          expect(document).toMatchObject({
            ok: false,
            code: "usage",
            detail: expect.stringContaining("fully qualified name"),
          });
          expect(fs.readFileSync(settingsPath, "utf8")).toBe(settings);
          expect(fs.readdirSync(workspace.path)).toEqual(["axm.json"]);
        } finally {
          workspace.cleanup();
        }
      },
    );
});
