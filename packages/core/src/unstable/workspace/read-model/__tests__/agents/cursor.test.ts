/**
 * cursor per-agent module: golden-path projector tests.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import { makeAgentDirOccurrence } from "../../__fixtures__/occurrences.js";
import { agentModule as module } from "../../agents/cursor.js";
import type { AgentScannerObservations } from "../../agents/types.js";

const noObservations: AgentScannerObservations = {
  agentDir: [],
  agentSettings: [],
  mcpConfig: [],
};

const cursorDirObservation = makeAgentDirOccurrence({
  scope: "project",
  type: "skill",
  agentId: "cursor",
  name: "some-skill",
  contentLocation: "/repo/.cursor/skills/some-skill",
});

describe("agents/cursor module", () => {
  it("identifies as cursor", () => {
    expect(module.agentId).toBe("cursor");
  });

  it("declared returns Some when settings declare cursor", () => {
    const result = module.declared("project", Option.some({ agents: ["cursor"] }));
    expect(Option.isSome(result)).toBe(true);
  });

  it("actual returns Some when scanner observed cursor", () => {
    const result = module.actual("project", {
      ...noObservations,
      agentDir: [cursorDirObservation],
    });
    expect(Option.isSome(result)).toBe(true);
  });

  it("detected returns managed-and-present when both declared and actual", () => {
    const declaredOpt = module.declared("project", Option.some({ agents: ["cursor"] }));
    const actualOpt = module.actual("project", {
      ...noObservations,
      agentDir: [cursorDirObservation],
    });
    const result = module.detected("project", declaredOpt, true, actualOpt);
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.status).toBe("managed-and-present");
    }
  });

  it("detected returns None when neither declared nor actual", () => {
    const result = module.detected("project", Option.none(), false, Option.none());
    expect(Option.isNone(result)).toBe(true);
  });
});
