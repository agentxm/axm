import { describe, expect, it } from "vitest";
import { ruleMaterializationObservation } from "./manager.js";

describe("ruleMaterializationObservation", () => {
  it("reports agents with current instruction projections through the managed region", () => {
    expect(
      ruleMaterializationObservation("AGENTS.md", [
        { agentId: "codex", health: "ok" },
        { agentId: "claude-code", health: "ok" },
        { agentId: "codex", health: "ok" },
        { agentId: "cursor", health: "unsupported" },
      ]),
    ).toEqual({
      agents: ["codex", "claude-code"],
      targets: [
        {
          path: "AGENTS.md",
          agentIds: ["codex", "claude-code"],
        },
      ],
    });
  });

  it("reports applicable empty coverage when no instruction projection is usable", () => {
    expect(
      ruleMaterializationObservation("AGENTS.md", [{ agentId: "cursor", health: "unsupported" }]),
    ).toEqual({
      agents: [],
      targets: [{ path: "AGENTS.md" }],
    });
  });
});
