import { describe, expect, it } from "@effect/vitest";
import { projectExpectedEntry } from "@agentxm/agent-integration";

import { diffAgentEntry } from "./drift.js";

describe("MCP drift", () => {
  it("compares nested metadata without reporting order-only drift", () => {
    const expected = projectExpectedEntry({
      serverName: "demo",
      entry: {
        source: "inline",
        command: "npx",
        args: ["-y", "@acme/context"],
        env: {},
        enabled: true,
      },
      stdio: {
        typeField: {
          required: {
            name: "type",
            value: "stdio",
          },
          accepted: [
            {
              name: "type",
              value: "stdio",
            },
          ],
        },
        command: "split",
        envKey: "env",
      },
      remote: null,
      activationField: {
        required: { name: "enabled", enabled: true, disabled: false },
        accepted: [{ name: "enabled", enabled: true, disabled: false }],
      },
    });

    expect(
      diffAgentEntry(expected, {
        "x-axm": {
          source: "inline",
          ext: "@workspace/mcps/demo",
          managed: true,
          v: 1,
        },
        type: "stdio",
        enabled: true,
        command: "npx",
        args: ["-y", "@acme/context"],
      }),
    ).toEqual({ _tag: "match" });
  });
});
