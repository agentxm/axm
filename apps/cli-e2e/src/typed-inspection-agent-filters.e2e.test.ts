import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "./e2e/utils.js";

export const executionBinding = {
  requirements: ["cli/agent-selection-is-membership-or-filter"],
  boundary: "process",
  rationale:
    "Runs the real subagent show parser and runtime to prove inspection filters cannot be combined with rendering, and that the usage error precedes workspace validation without writes.",
} as const;

describe("Typed inspection agent grammar", () => {
  it.each([
    ["--agent", "claude-code", "--render", "codex"],
    ["--render", "codex", "--agent", "claude-code", "--agent", "cursor"],
  ])(
    "rejects inspection filtering with rendering before reading workspace state: %j",
    async (...flags) => {
      const workspace = createTempDir();
      const settingsPath = path.join(workspace.path, "axm.json");
      const settings = "invalid workspace settings must not outrank argument validation\n";
      try {
        fs.writeFileSync(settingsPath, settings);
        const result = await runCli(["subagents", "show", "reviewer", ...flags, "--json"], {
          cwd: workspace.path,
        });
        const document: unknown = JSON.parse(result.stdout);
        expect(result.exitCode).toBe(2);
        expect(document).toMatchObject({
          ok: false,
          code: "usage",
          detail: expect.stringContaining("--agent and --render"),
        });
        expect(fs.readFileSync(settingsPath, "utf8")).toBe(settings);
        expect(fs.readdirSync(workspace.path)).toEqual(["axm.json"]);
      } finally {
        workspace.cleanup();
      }
    },
  );
});
