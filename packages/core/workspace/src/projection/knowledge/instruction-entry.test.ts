import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";
import { KnowledgeManifestSchema } from "@agentxm/extension-model/unstable/knowledge/manifest-schema";

describe("resolveKnowledgeInstructionEntry", () => {
  it.each([true, false] as const)(
    "accepts a manifest instruction-entry default of %s",
    (instructionEntry) => {
      const manifest = Schema.decodeUnknownSync(KnowledgeManifestSchema)({
        owner: "@acme",
        type: "knowledge",
        name: "platform",
        version: "1.0.0",
        format: { name: "okf", version: "0.2" },
        bundleRoot: "src",
        instructionEntry,
      });

      expect(manifest.instructionEntry).toBe(instructionEntry);
    },
  );
});
