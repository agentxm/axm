import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import {
  applySync,
  expectResolved,
  makeFileRegistry,
  makeSyncFixture,
} from "../testing/sync-fixture.js";

it.effect(
  "settles a new Knowledge bundle before reading back retained outputs during agent cleanup",
  () => {
    const registry = makeFileRegistry();
    registry.writeSkill("review", [{ version: "1.0.0", body: "Review carefully." }]);
    registry.writeKnowledge("notes", [{ version: "1.0.0", body: "Architecture notes." }]);
    const settings = {
      owner: "@acme",
      agents: ["claude-code"],
      defaultRegistry: "test",
      sources: [registry.source],
      instructionFiles: {},
      skills: { review: "@acme/skills/review" },
    };
    const workspace = makeSyncFixture({
      settings,
      files: { "AGENTS.md": "# Authored instructions\n" },
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          expect(deriveOperationOutcome(expectResolved(yield* applySync()))).toBe("applied");
          expect(workspace.exists(".claude/skills/review")).toBe(true);
          workspace.writeSettings({
            ...settings,
            agents: [],
            knowledge: { notes: "@acme/knowledge/notes" },
          });
          const result = expectResolved(yield* applySync());
          expect(deriveOperationOutcome(result), JSON.stringify(result)).toBe("applied");
          expect(result.units.some((unit) => unit.state === "failed")).toBe(false);
          expect(workspace.exists(".claude/skills/review")).toBe(false);
          expect(workspace.exists(".agents/skills/review")).toBe(true);
          expect(workspace.readFile("AGENTS.md")).toContain("notes");
        }),
      )
      .pipe(
        Effect.provide(NodeServices.layer),
        Effect.ensuring(
          Effect.sync(() => {
            workspace.cleanup();
            registry.cleanup();
          }),
        ),
      );
  },
);
