import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { SubagentManager } from "@agentxm/workspace-kernel/materialization";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { applySync, expectResolved, makeSyncFixture } from "../testing/sync-fixture.js";

describe("Subagent resource ownership", () => {
  it.effect(
    "refuses an invalid resource before retiring the same package's recorded native output",
    () => {
      const workspace = makeSyncFixture({
        settings: {
          owner: "@acme",
          agents: ["codex", "cursor"],
          subagents: { review: "workspace" },
        },
        files: {
          "subagents/review/subagent.json": JSON.stringify({
            owner: "@acme",
            type: "subagent",
            name: "review",
            version: "1.0.0",
            description: "Review",
            core: { instructions: "core.md" },
            implementations: { codex: { kind: "native", source: "review.toml" } },
          }),
          "subagents/review/review.toml":
            'name = "review"\ndescription = "Review"\ndeveloper_instructions = "Review."\nmodel_instructions_file = "instructions.md"\n',
          "subagents/review/core.md": "Review the project.",
          "subagents/review/instructions.md": "Review the complete change.",
        },
      });
      return Effect.gen(function* () {
        expect(deriveOperationOutcome(expectResolved(yield* workspace.provide(applySync())))).toBe(
          "applied",
        );
        const codex = workspace.readFile(".codex/agents/review.toml");
        const cursor = workspace.readFile(".cursor/agents/review.md");
        const lock = workspace.readFile("axm.lock");
        workspace.remove("subagents/review/instructions.md");
        const result = yield* workspace.provide(applySync()).pipe(Effect.result);
        expect(workspace.exists(".codex/agents/review.toml")).toBe(true);
        expect(workspace.readFile(".codex/agents/review.toml")).toBe(codex);
        expect(workspace.readFile(".cursor/agents/review.md")).toBe(cursor);
        expect(workspace.readFile("axm.lock")).toBe(lock);
        expect(
          Result.isFailure(result) ||
            (result.success._tag === "Resolved" &&
              deriveOperationOutcome(result.success.resolution) === "failed"),
        ).toBe(true);
      }).pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
    },
    30_000,
  );

  it.effect(
    "keeps a declared native name owned when its resource disappears during sibling removal",
    () => {
      const workspace = makeSyncFixture({
        settings: {
          owner: "@acme",
          agents: ["codex"],
          subagents: { reviewer: "workspace", helper: "workspace" },
        },
        files: {
          "subagents/reviewer/subagent.json": JSON.stringify({
            owner: "@acme",
            type: "subagent",
            name: "reviewer",
            version: "1.0.0",
            implementations: { codex: { kind: "native", source: "review.toml" } },
          }),
          "subagents/reviewer/review.toml":
            'name = "investigator"\ndescription = "Review"\ndeveloper_instructions = "Review."\nmodel_instructions_file = "instructions.md"\n',
          "subagents/reviewer/instructions.md": "Review the project.",
          "subagents/helper/subagent.json": JSON.stringify({
            owner: "@acme",
            type: "subagent",
            name: "helper",
            version: "1.0.0",
            description: "Help",
            core: { instructions: "core.md" },
          }),
          "subagents/helper/core.md": "Help with the project.",
        },
      });
      return Effect.gen(function* () {
        expect(deriveOperationOutcome(expectResolved(yield* workspace.provide(applySync())))).toBe(
          "applied",
        );
        const native = ".codex/agents/investigator.toml";
        const before = workspace.readFile(native);
        workspace.remove("subagents/reviewer/instructions.md");
        yield* workspace.provide(
          Effect.gen(function* () {
            const manager = yield* SubagentManager;
            yield* manager.materializeUninstall({ target: { type: "subagent", name: "helper" } });
          }),
        );
        expect(workspace.exists(".codex/agents/helper.toml")).toBe(false);
        expect(workspace.readFile(native)).toBe(before);
      }).pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
    },
    30_000,
  );
});
