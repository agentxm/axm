import { describe, expect, it } from "@effect/vitest";
import { projectExpectedEntry } from "../../agent-adapters/index.js";

import { diffAgentEntry } from "./drift.js";

describe("MCP drift", () => {
  it("reports obsolete native metadata as value drift", () => {
    const expected = projectExpectedEntry({
      serverName: "demo",
      entry: {
        kind: "inline",
        connection: { transport: "stdio", command: "npx", args: ["-y", "@acme/context"], env: {} },
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
    ).toEqual({ _tag: "drift", fields: ["x-axm"] });
  });
});
