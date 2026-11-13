import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import { LocalInspection, LocalInspectionDocumentSchema } from "./index.js";
import { ShowAgentOutcomeSchema } from "./show/agent-outcomes.js";
import { AUTHORING_TYPES, makeAuthoredExtensionFixture } from "./testing.js";

export const specification = defineSpecification({
  requirement: "cli/typed-shows/use-shared-agent-outcomes",
  title: "Typed inspection reports the shared per-agent outcome contract",
  statement:
    "Every typed show result shall report each subject's per-agent outcomes under the shared agent-outcomes collection, supplying extension type and name once through the enclosing subject identity while retaining agent identity, lifecycle outcome, bounded reason code, and optional inspection detail. Native evidence and reader declarations shall resolve through the document's result-local tables. Per-agent rows shall omit repeated extension identity and the superseded agent and status representation.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  boundaryRationale:
    "Production workspace services execute over native temporary files and directories; the default examples observe their state and outcomes without a separate CLI process.",
  boundary: "platform",
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
      const read = LocalInspection.query({
        selection: { kind: "identities", identities: ["example"] },
        types: [type],
        agents: ["claude-code", "codex"],
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            const document = yield* read;
            expect(
              Schema.decodeUnknownSync(LocalInspectionDocumentSchema)(document, {
                onExcessProperty: "error",
              }),
            ).toEqual(document);
            const result = document.items[0];
            if (result === undefined)
              return yield* Effect.die(new Error("Expected inspected subject"));
            expect(result.agentOutcomes.length).toBeGreaterThan(0);
            expect(result.identity).toMatchObject({ type, name: "example" });
            for (const row of result.agentOutcomes) {
              const contextual = {
                ...row,
                extensionType: result.identity.type,
                name: result.identity.name,
              };
              expect(
                Schema.decodeUnknownSync(ShowAgentOutcomeSchema)(contextual, {
                  onExcessProperty: "error",
                }),
              ).toEqual(contextual);
              expect(row).not.toHaveProperty("extensionType");
              expect(row).not.toHaveProperty("name");
              expect(row).not.toHaveProperty("agent");
              expect(row).not.toHaveProperty("status");
            }
            expect(result.agentOutcomes).toContainEqual(
              expect.objectContaining({
                agentId: "codex",
                outcome: "not-applicable",
                reasonCode: "agent-not-configured",
              }),
            );
            for (const reference of result.nativeLocationRefs) {
              expect(
                document.nativeLocations.filter((entry) => entry.id === reference),
              ).toHaveLength(1);
            }
            for (const location of document.nativeLocations) {
              expect(
                document.nativeReaderDeclarations.filter(
                  (entry) => entry.id === location.readerDeclarationRef,
                ),
              ).toHaveLength(1);
            }
            expect(fixture.requests).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
  }
});
