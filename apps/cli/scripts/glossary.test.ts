import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { renderGlossary } from "./glossary.js";

const manifest = {
  owner: "@agentxm",
  name: "agent-extension-engineering",
  version: "0.2.0",
  license: "CC-BY-4.0",
};
const concept =
  "---\ntype: Reference\ntitle: Agent Extension Glossary\ndescription: Shared terms.\n---\n\n# Agent Extension Glossary\n\n### Skill\n\nA capability. See [Pack](#pack).\n\n### Pack\n\nA composition.\n";

describe("glossary generation", () => {
  it.effect("changes the snapshot digest when a definition changes", () =>
    Effect.gen(function* () {
      const before = yield* renderGlossary(concept, manifest);
      const after = yield* renderGlossary(
        concept.replace("A capability.", "A reusable workflow."),
        manifest,
      );
      expect(before.match(/Source SHA-256: (\w+)/u)?.[1]).not.toBe(
        after.match(/Source SHA-256: (\w+)/u)?.[1],
      );
      expect(after).toContain("A reusable workflow.");
      expect(after).toContain("[Pack](#pack)");
    }),
  );

  it.effect("rejects a link that would break in the independent skill copy", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        renderGlossary(concept.replace("#pack", "../pack.md"), manifest),
      );
      expect(result._tag).toBe("Failure");
    }),
  );
});
