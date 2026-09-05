import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Schema from "effect/Schema";
import * as fs from "node:fs";
import * as path from "node:path";
import { handleKnowledgeList, KnowledgeListQueryResultSchema } from "axm.sh/specification-harness";
import { makeKnowledgeSpecWorkspace } from "../../../support/knowledge-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/list/explains-instruction-entry-inclusion",
  title: "Knowledge list explains instruction entry inclusion",
  statement:
    "When listing an installed or explicitly disabled Knowledge bundle, AXM shall report whether its entry is included in agent instructions and the effective reason for that decision.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/knowledge/list.ts",
    "packages/cli/help/topics/knowledge.md",
    "packages/extension-workspace/src/knowledge/instruction-entry.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Knowledge instruction inclusion", () => {
  const rows: ReadonlyArray<{
    readonly label: string;
    readonly enabled: boolean;
    readonly workspaceEntry?: boolean;
    readonly manifestEntry?: boolean;
    readonly instructionFiles: boolean;
    readonly knowledgeInstructions: boolean;
    readonly included: boolean;
    readonly reason: string;
  }> = [
    {
      label: "default inclusion",
      enabled: true,
      instructionFiles: true,
      knowledgeInstructions: true,
      included: true,
      reason: "included",
    },
    {
      label: "disabled bundle",
      enabled: false,
      workspaceEntry: true,
      instructionFiles: true,
      knowledgeInstructions: true,
      included: false,
      reason: "bundle-disabled",
    },
    {
      label: "workspace exclusion",
      enabled: true,
      workspaceEntry: false,
      instructionFiles: true,
      knowledgeInstructions: true,
      included: false,
      reason: "workspace-excluded",
    },
    {
      label: "instruction files disabled",
      enabled: true,
      workspaceEntry: true,
      instructionFiles: false,
      knowledgeInstructions: true,
      included: false,
      reason: "instruction-files-disabled",
    },
    {
      label: "Knowledge instruction discovery disabled",
      enabled: true,
      workspaceEntry: true,
      instructionFiles: true,
      knowledgeInstructions: false,
      included: false,
      reason: "knowledge-instructions-disabled",
    },
    {
      label: "manifest exclusion",
      enabled: true,
      manifestEntry: false,
      instructionFiles: true,
      knowledgeInstructions: true,
      included: false,
      reason: "manifest-excluded",
    },
    {
      label: "workspace inclusion overrides manifest exclusion",
      enabled: true,
      workspaceEntry: true,
      manifestEntry: false,
      instructionFiles: true,
      knowledgeInstructions: true,
      included: true,
      reason: "included",
    },
  ];
  for (const row of rows)
    it.effect(row.label, () => {
      const entry = {
        source: "workspace",
        enabled: row.enabled,
        ...(row.workspaceEntry === undefined ? {} : { instructionEntry: row.workspaceEntry }),
      };
      const workspace = makeKnowledgeSpecWorkspace({
        bundles: [{ name: "platform", enabled: row.enabled, documents: {} }],
      });
      workspace.writeSettings({
        owner: "@acme",
        agents: [],
        instructionFiles: row.instructionFiles
          ? { fileName: "AGENTS.md", gitignoreAliases: false }
          : false,
        knowledgeConfig: { instructions: row.knowledgeInstructions },
        knowledge: { platform: entry },
      });
      if (row.manifestEntry !== undefined) {
        const file = path.join(workspace.root, "knowledge/platform/knowledge.json");
        const manifest: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        if (typeof manifest !== "object" || manifest === null)
          throw new Error("Expected Knowledge manifest");
        fs.writeFileSync(
          file,
          JSON.stringify({ ...manifest, instructionEntry: row.manifestEntry }),
        );
      }
      return workspace.provide(
        Effect.gen(function* () {
          yield* handleKnowledgeList();
          const result = Schema.decodeUnknownSync(Schema.toType(KnowledgeListQueryResultSchema))(
            workspace.rendererState.results.at(-1)?.data,
          );
          expect(result.items.find((item) => item.name === "platform")?.instructionEntry).toEqual({
            included: row.included,
            reason: row.reason,
          });
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
});
