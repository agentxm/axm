import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { lintProjectWithHome, lintServices } from "../../test-helpers.js";
import { isolatedLintRules, makeLintWorkspace } from "../../testing.js";

const RULE = "workspace/native-outputs-readable";

describe("incomplete native configuration diagnostics", () => {
  it.effect(
    "reports project and user failures safely in human and JSON finding data without writes",
    () => {
      const secret = "opaque-environment-setting-that-must-stay-private";
      const project = makeLintWorkspace({
        settings: {
          agents: ["claude-code", "cursor"],
          lint: { rules: isolatedLintRules(RULE, "warn") },
        },
        files: {
          ".claude/settings.json": JSON.stringify({
            hooks: [],
            env: { UNFAMILIAR_NATIVE_SETTING: secret },
          }),
          ".mcp.json": JSON.stringify({ mcpServers: { healthy: { command: "node" } } }),
        },
      });
      const home = makeLintWorkspace({
        files: {
          ".cursor/mcp.json": JSON.stringify({
            mcpServers: [],
            env: { UNFAMILIAR_NATIVE_SETTING: secret },
          }),
        },
      });
      return Effect.gen(function* () {
        const before = [project.snapshot(), home.snapshot()];
        const result = yield* lintProjectWithHome(project, home.root);
        const findings = result.document.findings.filter((finding) => finding.ruleId === RULE);
        expect(findings).toHaveLength(2);
        expect(
          findings.some(
            (finding) =>
              finding.message.includes(".claude/settings.json") &&
              finding.message.includes("decode"),
          ),
        ).toBe(true);
        expect(
          findings.some(
            (finding) =>
              finding.message.includes(".cursor/mcp.json") && finding.message.includes("decode"),
          ),
        ).toBe(true);
        // Both output paths receive only the projected findings, not the internal causes.
        expect(JSON.stringify(result.document)).not.toContain(secret);
        expect(JSON.stringify(result.summary)).not.toContain(secret);
        expect([project.snapshot(), home.snapshot()]).toEqual(before);
      }).pipe(
        Effect.provide(lintServices(project)),
        Effect.ensuring(
          Effect.sync(() => {
            project.cleanup();
            home.cleanup();
          }),
        ),
      );
    },
  );
});
