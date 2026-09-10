import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ListKnowledge } from "./list-knowledge.js";
import { makeKnowledgeInventoryFixture } from "../testing.js";

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
    "packages/core/workspace-inspection/src/knowledge/list-knowledge.ts",
    "apps/cli/help/topics/knowledge.md",
    "packages/core/workspace-projection/src/knowledge/instruction-entry.test.ts",
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
      const fixture = makeKnowledgeInventoryFixture({
        instructionFiles: row.instructionFiles,
        knowledgeInstructions: row.knowledgeInstructions,
        bundles: [
          {
            name: "platform",
            enabled: row.enabled,
            ...(row.workspaceEntry === undefined ? {} : { instructionEntry: row.workspaceEntry }),
            ...(row.manifestEntry === undefined
              ? {}
              : { manifestInstructionEntry: row.manifestEntry }),
          },
        ],
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            const { rows: items } = yield* ListKnowledge.query();
            expect(items.find((item) => item.name === "platform")?.instructionEntry).toEqual({
              included: row.included,
              reason: row.reason,
            });
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
});
