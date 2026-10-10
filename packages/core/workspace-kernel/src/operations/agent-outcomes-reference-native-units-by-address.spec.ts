import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ConfiguredAgentOutcomeSchema } from "./configured-agent-outcome.js";

export const specification = defineSpecification({
  requirement: "workspace/agent-outcomes/reference-native-units-by-address",
  title: "Agent outcomes reference native units by scope and structured address",
  statement:
    "A configured-agent outcome that refers to native ownership units shall identify each unit through a collection of references containing its project or user scope and structured entry, file, key-path, or region address, preserving selector boundaries without requiring a second JSON parse.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  methods: ["decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const outcome = {
  extensionType: "skill",
  name: "review",
  agentId: "cursor",
  outcome: "current",
  reasonCode: "verified-native-unit",
  reason: "The native entry matches accepted content.",
} as const;

const addresses = [
  { kind: "entry", path: ".cursor/skills/review" },
  { kind: "file", path: ".cursor/config.json" },
  { kind: "key-path", path: ".cursor/config.json", keys: ["mcpServers", "name.with/a.selector"] },
  { kind: "region", path: "AGENTS.md", region: "rules" },
] as const;

describe("Structured native-unit references", () => {
  for (const scope of ["project", "user"] as const) {
    for (const address of addresses) {
      it(`${scope} ${address.kind} retains its address and selector boundaries`, () => {
        const document = { ...outcome, nativeUnits: [{ scope, address }] };
        expect(Schema.decodeUnknownSync(ConfiguredAgentOutcomeSchema)(document)).toEqual(document);
      });
    }
  }

  it("refuses a serialized internal map key as a native unit", () => {
    expect(() =>
      Schema.decodeUnknownSync(ConfiguredAgentOutcomeSchema)({
        ...outcome,
        nativeUnits: [JSON.stringify(["project", "entry", ".cursor/skills/review", null])],
      }),
    ).toThrow();
  });
});
