import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";
import { resolveKnowledgeInstructionEntry } from "./instruction-entry.js";
import { KnowledgeManifestSchema } from "@agentxm/extension-model/unstable/knowledge/manifest-schema";

describe("resolveKnowledgeInstructionEntry", () => {
  it.each([
    [
      "bundle-disabled",
      {
        bundleEnabled: false,
        instructionFilesEnabled: true,
        knowledgeInstructionsEnabled: true,
        workspaceInstructionEntry: true,
      },
    ],
    [
      "instruction-files-disabled",
      {
        bundleEnabled: true,
        instructionFilesEnabled: false,
        knowledgeInstructionsEnabled: true,
        workspaceInstructionEntry: true,
      },
    ],
    [
      "knowledge-instructions-disabled",
      {
        bundleEnabled: true,
        instructionFilesEnabled: true,
        knowledgeInstructionsEnabled: false,
        workspaceInstructionEntry: true,
      },
    ],
    [
      "workspace-excluded",
      {
        bundleEnabled: true,
        instructionFilesEnabled: true,
        knowledgeInstructionsEnabled: true,
        workspaceInstructionEntry: false,
      },
    ],
    [
      "manifest-excluded",
      {
        bundleEnabled: true,
        instructionFilesEnabled: true,
        knowledgeInstructionsEnabled: true,
        manifestInstructionEntry: false,
      },
    ],
    [
      "included",
      {
        bundleEnabled: true,
        instructionFilesEnabled: true,
        knowledgeInstructionsEnabled: true,
      },
    ],
    [
      "included",
      {
        bundleEnabled: true,
        instructionFilesEnabled: true,
        knowledgeInstructionsEnabled: true,
        workspaceInstructionEntry: true,
        manifestInstructionEntry: false,
      },
    ],
  ] as const)("returns %s for the ordered gate decision", (reason, args) => {
    expect(resolveKnowledgeInstructionEntry(args)).toEqual({
      included: reason === "included",
      reason,
    });
  });

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
