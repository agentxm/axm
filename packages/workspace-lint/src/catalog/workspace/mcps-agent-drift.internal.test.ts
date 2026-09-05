import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { mcpAgentDriftContext } from "./conformance/mcps/test-helpers.js";
import { mcpServerAgentDriftRule } from "./mcps-agent-drift.js";

describe("workspace/mcps-agent-drift", () => {
  it.effect("reports a shared projection once with every configured consumer", () =>
    Effect.gen(function* () {
      const context = yield* mcpAgentDriftContext({
        agentIds: ["claude-code", "github-copilot-cli"],
        shared: true,
        actualConfig: {
          "x-axm": {
            v: 1,
            managed: true,
            ext: "@workspace/mcps/demo",
            source: "inline",
          },
          type: "local",
          command: "node",
          args: ["server.js"],
        },
      });
      const findings = yield* mcpServerAgentDriftRule.check(context);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toContain("shared config");
      expect(findings[0]?.message).toContain("claude-code");
      expect(findings[0]?.message).toContain("github-copilot-cli");
      expect(findings[0]?.message).toContain("type");
    }),
  );

  it.effect("reports drift for disabled MCP rows", () =>
    Effect.gen(function* () {
      const context = yield* mcpAgentDriftContext({ activation: "disabled" });
      const findings = yield* mcpServerAgentDriftRule.check(context);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("workspace/mcps-agent-drift");
    }),
  );
});
