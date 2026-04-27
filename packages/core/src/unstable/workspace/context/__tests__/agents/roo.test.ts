/**
 * roo per-agent module: golden-path projector tests.
 *
 * Roo's subagent surface is single-file (`.roomodes`); we exercise that by
 * passing an `agent-dir` occurrence with `type: "subagent"` and the file path
 * as the `contentLocation`.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import { makeAgentDirOccurrence } from "../../__fixtures__/occurrences.js";
import { agentModule as module } from "../../agents/roo.js";
import type { AgentScannerObservations } from "../../agents/types.js";

const noObservations: AgentScannerObservations = {
  agentDir: [],
  agentSettings: [],
  mcpConfig: [],
};

const rooModesObservation = makeAgentDirOccurrence({
  scope: "project",
  type: "subagent",
  agentId: "roo",
  name: ".roomodes",
  contentLocation: "/repo/.roomodes",
  singleFile: true,
});

describe("agents/roo module", () => {
  it("identifies as roo", () => {
    expect(module.agentId).toBe("roo");
  });

  it("actual returns Some when .roomodes file observation present", () => {
    const result = module.actual("project", {
      ...noObservations,
      agentDir: [rooModesObservation],
    });
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.agentDirOccurrences).toHaveLength(1);
    }
  });

  it("declared+actual yields managed-and-present", () => {
    const declaredOpt = module.declared("project", Option.some({ agents: ["roo"] }));
    const actualOpt = module.actual("project", {
      ...noObservations,
      agentDir: [rooModesObservation],
    });
    const result = module.detected("project", declaredOpt, actualOpt);
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.status).toBe("managed-and-present");
    }
  });
});
