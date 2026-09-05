/**
 * codex per-agent module: golden-path projector tests.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import { makeAgentDirOccurrence } from "../../__fixtures__/occurrences.js";
import { getAgentModule } from "../../agents/index.js";
import type { AgentScannerObservations } from "../../agents/types.js";

const module = getAgentModule("codex");

const noObservations: AgentScannerObservations = {
  agentDir: [],
  agentSettings: [],
  mcpConfig: [],
};

const codexDirObservation = makeAgentDirOccurrence({
  scope: "project",
  type: "skill",
  agentId: "codex",
  name: "some-skill",
  contentLocation: "/repo/.codex/skills/some-skill",
});

describe("agents/codex module", () => {
  it("identifies as codex", () => {
    expect(module.agentId).toBe("codex");
  });

  it("declared returns Some when settings declare codex", () => {
    const result = module.declared("project", Option.some({ agents: ["codex"] }));
    expect(Option.isSome(result)).toBe(true);
  });

  it("actual returns Some when scanner observed codex", () => {
    const result = module.actual("project", {
      ...noObservations,
      agentDir: [codexDirObservation],
    });
    expect(Option.isSome(result)).toBe(true);
  });

  it("detected returns unmanaged-present for actual-only", () => {
    const actualOpt = module.actual("project", {
      ...noObservations,
      agentDir: [codexDirObservation],
    });
    const result = module.detected("project", Option.none(), true, actualOpt);
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.status).toBe("unmanaged-present");
    }
  });

  it("detected returns managed-not-present for declared-only", () => {
    const declaredOpt = module.declared("project", Option.some({ agents: ["codex"] }));
    const result = module.detected("project", declaredOpt, false, Option.none());
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.status).toBe("managed-not-present");
    }
  });
});
