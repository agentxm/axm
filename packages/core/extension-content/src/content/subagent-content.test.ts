import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { parseNativeSubagent } from "./subagent-content.js";

describe("native subagent parsing", () => {
  it.effect(
    "retains complete TOML, including comments, nested tables, and unknown native fields",
    () =>
      Effect.gen(function* () {
        const content =
          '# Native review\nname = "review_native"\ndescription = "Reviews"\ndeveloper_instructions = "Do the review."\n[model_settings]\nreasoning = "high"\n';
        const result = yield* parseNativeSubagent({
          agentId: "codex",
          source: "native/review.toml",
          content,
        });
        expect(result.content).toBe(content);
        expect(result.name).toBe("review_native");
        expect(result.instructions).toBe("Do the review.");
        expect(result.configuration["model_settings"]).toEqual({ reasoning: "high" });
      }),
  );

  it.effect("uses the source filename when a native definition omits name", () =>
    Effect.gen(function* () {
      const result = yield* parseNativeSubagent({
        agentId: "cursor",
        source: "native/native-reviewer.md",
        content: "---\ndescription: Reviews\n---\nReview.",
      });
      expect(result.name).toBe("native-reviewer");
    }),
  );

  it.effect("uses OpenCode and Mistral filename identity without rewriting native fields", () =>
    Effect.gen(function* () {
      const opencode = yield* parseNativeSubagent({
        agentId: "opencode",
        source: "native/file-identity.md",
        content: "---\nname: retained-config\ndescription: Reviews\n---\nReview.",
      });
      expect(opencode.name).toBe("file-identity");
      expect(opencode.configuration["name"]).toBe("retained-config");
      const mistral = yield* parseNativeSubagent({
        agentId: "mistral-vibe",
        source: "native/vibe-review.toml",
        content:
          'agent_type = "subagent"\ndisplay_name = "Reviewer"\nsystem_prompt_id = "existing-user-prompt"\n',
      });
      expect(mistral.name).toBe("vibe-review");
      expect(mistral.instructions).toBe("");
      expect(mistral.configuration["system_prompt_id"]).toBe("existing-user-prompt");
    }),
  );

  it.effect.each([
    { source: "native/a.md", content: "---\nname: [broken\n---\nBody" },
    { source: "native/a.md", content: "Missing frontmatter" },
    { source: "native/a.md", content: "---\nname: ../../escape\n---\nBody" },
    { source: "native/a.md", content: "---\nname: review\nagentOverrides: {}\n---\nBody" },
    { source: "native/a.toml", content: 'name = "review"\nname = "duplicate"' },
    { source: "native/a.toml", content: 'name = "review"\ndeveloper_instructions = ["invalid"]' },
    { source: "native/a.json", content: '{"name":"review", "nested":{"__proto__":{}}}' },
    { source: "native/a.xml", content: "<agent/>" },
  ])("rejects invalid native source $source", ({ source, content }) =>
    Effect.gen(function* () {
      const agentId = source.endsWith(".toml")
        ? "codex"
        : source.endsWith(".json")
          ? "kiro-cli"
          : "cursor";
      const error = yield* parseNativeSubagent({ agentId, source, content }).pipe(Effect.flip);
      expect(error.reason).toBe("native-invalid");
    }),
  );

  it.effect.each([
    {
      agentId: "codex",
      source: "native/review.md",
      content: "---\nname: review\ndescription: Reviews\n---\nReview.",
    },
    {
      agentId: "codex",
      source: "native/review.toml",
      content: 'description = "Reviews"\ndeveloper_instructions = "Review."',
    },
    {
      agentId: "codex",
      source: "native/review.toml",
      content: 'name = "review"\ndescription = "Reviews"',
    },
    {
      agentId: "claude-code",
      source: "native/review.md",
      content: "---\nname: review\n---\nReview.",
    },
    { agentId: "mistral-vibe", source: "native/review.toml", content: 'agent_type = "agent"' },
  ])("rejects a mismatched or incomplete $agentId definition", (args) =>
    Effect.gen(function* () {
      const error = yield* parseNativeSubagent(args).pipe(Effect.flip);
      expect(error.reason).toBe("native-invalid");
    }),
  );
});
