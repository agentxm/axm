import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { AdoptMcpServers } from "../index.js";
import { makeConfigurationFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/adopt/selected-batch-is-atomic",
  title: "The explicitly selected MCP adoption batch commits atomically",
  statement:
    "AXM shall treat all discovered unmanaged MCP candidates as one adoption batch unless names explicitly select a subset; any selected blocker or stale native source shall prevent the batch from changing desired state or native files, while a valid explicit subset may commit without altering excluded declarations.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity"],
  methods: ["example"],
  boundary: "platform",
  boundaryRationale:
    "Temporary workspace and native files observe the transaction and stale-source boundary.",
  derivedFrom: ["cli/mutations-are-closure-atomic"],
  supersedes: ["cli/mcps/import/selected-batch-is-atomic"],
  assumptions: [],
  openQuestions: [],
});

const fixtureForBatch = () =>
  makeConfigurationFixture({
    settings: { agents: ["claude-code", "cursor"] },
    files: {
      ".cursor/mcp.json": JSON.stringify({
        mcpServers: {
          good: { command: "node", args: ["fixture.js"] },
          blocked: { command: "node", args: ["fixture.js"], unsupportedHostOption: true },
        },
      }),
    },
  });

describe("selected native adoption batch", () => {
  it.effect("writes nothing when the default batch contains a blocker", () => {
    const fixture = fixtureForBatch();
    const before = fixture.snapshot();
    return fixture
      .provide(
        Effect.gen(function* () {
          const candidate = yield* AdoptMcpServers.prepare();
          expect(candidate.preflight.conflicts.map((finding) => finding.name)).toContain("blocked");
          yield* AdoptMcpServers.previewOrApply(candidate, preapprovedPlanExecution).pipe(
            Effect.result,
          );
          expect(fixture.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
  it.effect("adopts an explicit valid subset and preserves the excluded blocker", () => {
    const fixture = fixtureForBatch();
    return fixture
      .provide(
        Effect.gen(function* () {
          const candidate = yield* AdoptMcpServers.prepare(["good"]);
          expect(candidate.preflight.conflicts).toEqual([]);
          const result = yield* AdoptMcpServers.previewOrApply(candidate, preapprovedPlanExecution);
          expect(deriveOperationOutcome(result)).toBe("applied");
          const native: unknown = JSON.parse(fixture.readFile(".cursor/mcp.json"));
          expect(native).toMatchObject({
            mcpServers: {
              blocked: { command: "node", args: ["fixture.js"], unsupportedHostOption: true },
            },
          });
          expect(fixture.readFile("axm.json")).toContain('"good"');
          expect(fixture.readFile("axm.json")).not.toContain('"blocked"');
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
  it.effect(
    "refuses a source document changed after discovery without reverting that foreign edit",
    () => {
      const fixture = fixtureForBatch();
      return fixture
        .provide(
          Effect.gen(function* () {
            const candidate = yield* AdoptMcpServers.prepare(["good"]);
            fixture.writeFile(
              ".cursor/mcp.json",
              JSON.stringify({ mcpServers: { good: { command: "changed" } } }),
            );
            const afterForeignEdit = fixture.snapshot();
            yield* AdoptMcpServers.previewOrApply(candidate, preapprovedPlanExecution).pipe(
              Effect.result,
            );
            expect(fixture.snapshot()).toEqual(afterForeignEdit);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    },
  );
});
