import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import { ConfiguredAgentOutcomeSchema } from "@agentxm/workspace-kernel/operations";
import { ShowPack } from "./packs/show-pack.js";
import { ShowExtension } from "./show/show-extension.js";
import { AUTHORING_TYPES, makeAuthoredExtensionFixture } from "./testing.js";

export const specification = defineSpecification({
  requirement: "cli/typed-shows/use-shared-agent-outcomes",
  title: "Typed inspection reports the shared per-agent outcome contract",
  statement:
    "Every typed show result shall report per-agent outcomes under the shared agent-outcomes collection, retaining extension identity, agent identity, lifecycle outcome, and bounded reason code while allowing optional inspection detail and omitting the superseded agent and status representation.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  methods: ["decision-table", "contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Shared outcomes in typed inspection", () => {
  for (const type of AUTHORING_TYPES) {
    it.effect(type, () => {
      const fixture = makeAuthoredExtensionFixture(type);
      const read =
        type === "pack"
          ? ShowPack.query({ target: "example", agents: ["claude-code", "codex"] })
          : ShowExtension.query({ type, name: "example", agents: ["claude-code", "codex"] });
      return fixture
        .provide(
          Effect.gen(function* () {
            const result = yield* read;
            expect(result).not.toHaveProperty("agents");
            expect(result.agentOutcomes.length).toBeGreaterThan(0);
            for (const row of result.agentOutcomes) {
              const core = Schema.decodeUnknownSync(ConfiguredAgentOutcomeSchema)(row);
              expect(core).toMatchObject({ extensionType: type, name: "example" });
              expect(row).not.toHaveProperty("agent");
              expect(row).not.toHaveProperty("status");
            }
            expect(result.agentOutcomes).toContainEqual(
              expect.objectContaining({
                extensionType: type,
                name: "example",
                agentId: "codex",
                outcome: "not-applicable",
                reasonCode: "agent-not-configured",
              }),
            );
            expect(fixture.requests).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
  }
});
