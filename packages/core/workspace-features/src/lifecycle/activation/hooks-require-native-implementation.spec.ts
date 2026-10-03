import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  applyActivation,
  previewActivation,
  workspaceWithAuthoredExtension,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/hooks/activation/requires-native-implementation",
  title: "Hook activation requires native semantics without instruction fallback",
  statement:
    "When enabling a Hook, AXM shall require a supported native implementation for every configured target and shall block unavailable implementations without rewriting instructions or creating advisory fallback regions. A supported activation shall use native settings and leave instruction content unchanged.",
  class: "functional",
  role: "experience",
  goals: ["agent-interoperability", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "platform",
  boundaryRationale:
    "Activation over real workspace files observes the only allowed Hook activation mechanism.",
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Hooks require native implementations", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  for (const supported of [true, false]) {
    it.effect(
      `${supported ? "activates supported" : "blocks unsupported"} hooks without instruction fallback`,
      () => {
        const workspace = workspaceWithAuthoredExtension({
          type: "hook",
          name: "review",
          enabled: false,
        });
        cleanups.push(workspace.cleanup);
        workspace.writeFile(
          "axm.json",
          JSON.stringify({
            owner: "@acme",
            agents: supported ? ["claude-code"] : ["claude-code", "windsurf"],
            instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
            hooks: { review: { source: "workspace", enabled: false } },
          }),
        );
        workspace.writeFile("AGENTS.md", "# Human instructions\n");
        workspace.writeFile("CLAUDE.md", "# Human alias\n");
        return workspace
          .provide(
            Effect.gen(function* () {
              const before = workspace.snapshot();
              const preview = yield* previewActivation({
                type: "hook",
                name: "review",
                enabled: true,
              });
              expect(preview._tag === "Resolved" ? preview.outcome : preview._tag).toBe(
                supported ? "previewed" : "blocked",
              );
              expect(workspace.snapshot()).toEqual(before);
              const applied = yield* applyActivation({
                type: "hook",
                name: "review",
                enabled: true,
              });
              expect(applied._tag === "Resolved" ? applied.outcome : applied._tag).toBe(
                supported ? "applied" : "blocked",
              );
              if (!supported) expect(workspace.snapshot()).toEqual(before);
              else expect(workspace.readFile(".claude/settings.json")).toContain("PreToolUse");
              expect(workspace.readFile("AGENTS.md")).toBe("# Human instructions\n");
              expect(workspace.readFile("CLAUDE.md")).toBe("# Human alias\n");
            }),
          )
          .pipe(Effect.provide(NodeServices.layer));
      },
      { timeout: 20_000 },
    );
  }
});
