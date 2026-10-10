import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import { ConfiguredAgentOutcomeSchema, ConfiguredAgentReasonCodeSchema } from "./index.js";

export const specification = defineSpecification({
  requirement: "workspace/agent-outcomes/use-published-vocabulary",
  title: "Agent outcomes use one bounded published vocabulary",
  statement:
    "Every configured-agent outcome shall identify its extension and agent, use one of the six published lifecycle outcomes and a reason from the shared published reason-code enum, and reject unknown outcomes or reasons.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  methods: ["decision-table", "contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const base = {
  extensionType: "skill",
  name: "review",
  agentId: "codex",
  outcome: "current",
  reasonCode: "supported",
  reason: "The configured projection is supported.",
} as const;

describe("Published agent-outcome vocabulary", () => {
  for (const outcome of [
    "projected",
    "current",
    "not-applicable",
    "unsupported",
    "blocked",
    "failed",
  ]) {
    it(`accepts the ${outcome} lifecycle outcome`, () => {
      expect(Schema.decodeUnknownSync(ConfiguredAgentOutcomeSchema)({ ...base, outcome })).toEqual({
        ...base,
        outcome,
      });
    });
  }

  for (const reasonCode of ConfiguredAgentReasonCodeSchema.literals) {
    it(`accepts the published reason ${reasonCode}`, () => {
      expect(
        Schema.decodeUnknownSync(ConfiguredAgentOutcomeSchema)({ ...base, reasonCode }).reasonCode,
      ).toBe(reasonCode);
    });
  }

  for (const invalid of [
    { outcome: "ready" },
    { reasonCode: "arbitrary-reason" },
    { agentId: undefined },
    { extensionType: undefined },
    { name: undefined },
  ]) {
    it(`rejects invalid ${Object.keys(invalid).join(", ")}`, () => {
      expect(() =>
        Schema.decodeUnknownSync(ConfiguredAgentOutcomeSchema)({ ...base, ...invalid }),
      ).toThrow();
    });
  }
});
