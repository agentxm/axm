/**
 * Agent registry barrel tests: the `agents/index.ts` barrel SHALL list every
 * registered agent module, expose the `AgentNativeConfig` open union as the
 * union of every module's typed `nativeConfig` shape, and serve as the single
 * registration site so adding a new agent does not touch `WorkspaceContext`.
 *
 * Per Decision 4 of the workspace-context design and Phase 8 hand-off notes:
 *   - The barrel exposes `registeredAgentModules: ReadonlyArray<AgentModule>`.
 *   - The barrel re-exports per-agent `*NativeConfig` variants and
 *     `AgentNativeConfig` as their open union.
 *   - Every `AgentId` from the canonical `AGENT_IDS` tuple maps to exactly one
 *     module via the typed-record registry — missing entries fail at
 *     type-check.
 *   - Every module exposes `agentId`, `subjects`, and the three projector
 *     functions: `declared`, `actual`, `detected`.
 */

import { describe, expect, it } from "@effect/vitest";
import { AGENT_IDS, type AgentId } from "../../../../agents/types.js";
import {
  getAgentModule,
  registeredAgentModules,
  type AgentModule,
  type AgentNativeConfig,
} from "../../agents/index.js";

// Compile-time `AgentNativeConfig`-union assertions live in
// `registry.type-test.ts` so they are typechecked but excluded from the
// runtime suite.

describe("agents/index.ts barrel", () => {
  it("lists every registered agent id exactly once in canonical order", () => {
    expect(registeredAgentModules.length).toBe(AGENT_IDS.length);
    const seen = new Set<AgentId>();
    registeredAgentModules.forEach((module, i) => {
      expect(module.agentId).toBe(AGENT_IDS[i]);
      expect(seen.has(module.agentId)).toBe(false);
      seen.add(module.agentId);
    });
    for (const id of AGENT_IDS) {
      expect(seen.has(id)).toBe(true);
    }
  });

  it("each module's agentId is valid", () => {
    const validIds: ReadonlySet<string> = new Set<string>(AGENT_IDS);
    for (const module of registeredAgentModules) {
      expect(validIds.has(module.agentId)).toBe(true);
    }
  });

  it("each module exposes the required projector functions and subjects", () => {
    for (const module of registeredAgentModules) {
      const m: AgentModule<AgentNativeConfig> = module;
      expect(typeof m.declared).toBe("function");
      expect(typeof m.actual).toBe("function");
      expect(typeof m.detected).toBe("function");
      expect(Array.isArray(m.subjects)).toBe(true);
    }
  });

  it("getAgentModule returns the matching module for every AGENT_IDS entry", () => {
    for (const id of AGENT_IDS) {
      const m = getAgentModule(id);
      expect(m.agentId).toBe(id);
    }
  });
});
