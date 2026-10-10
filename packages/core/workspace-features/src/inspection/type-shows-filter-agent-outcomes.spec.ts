import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";
import { ShowPack } from "./packs/show-pack.js";
import { ShowExtension } from "./show/show-extension.js";
import { AUTHORING_TYPES, makeAuthoredExtensionFixture } from "./testing.js";

export const specification = defineSpecification({
  requirement: "cli/type-shows-filter-agent-outcomes",
  title: "Typed inspection filters outcomes and identifies unconfigured agents",
  statement:
    "Every typed show route shall filter agent outcomes to the selected agents and report each requested unconfigured agent as not configured, without changing workspace membership or durable state.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["decision-table", "example"],
  derivedFrom: ["cli/agent-selection-is-membership-or-filter"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Agent-selected extension detail", () => {
  for (const type of AUTHORING_TYPES)
    it.effect(type, () => {
      const fixture = makeAuthoredExtensionFixture(type);
      const read = (agents: ReadonlyArray<string>) =>
        type === "pack"
          ? ShowPack.query({ target: "example", agents })
          : ShowExtension.query({ type, name: "example", agents });
      return fixture
        .provide(
          Effect.gen(function* () {
            const before = fixture.snapshot();
            const unfiltered = yield* read([]);
            const configured = yield* read(["claude-code"]);
            expect(configured.agentOutcomes).toEqual(
              unfiltered.agentOutcomes.filter((row) => row.agentId === "claude-code"),
            );
            const selected = yield* read(["claude-code", "codex", "codex"]);
            expect(selected.agentOutcomes.filter((row) => row.agentId === "claude-code")).toEqual(
              configured.agentOutcomes,
            );
            expect(selected.agentOutcomes.filter((row) => row.agentId === "codex")).toEqual([
              expect.objectContaining({
                agentId: "codex",
                reasonCode: "agent-not-configured",
                projection: "not-configured",
              }),
            ]);
            expect(
              selected.agentOutcomes.every(
                (row) => row.agentId === "claude-code" || row.agentId === "codex",
              ),
            ).toBe(true);
            expect(fixture.requests).toEqual([]);
            expect(fixture.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
});
