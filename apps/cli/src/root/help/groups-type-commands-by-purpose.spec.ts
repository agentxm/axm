import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";
import { captureHelpDoc } from "../../test-support/command-tree-test-helpers.js";
import { toJsonHelpDoc } from "../../cli-runtime/index.js";

export const specification = defineSpecification({
  requirement: "cli/help/groups-type-commands-by-purpose",
  title: "Extension command groups separate management from authoring",
  statement:
    "Each extension type shall present management before authoring, order the shared management commands as install, update, uninstall, list, show, enable, and disable, then its additional management commands, and order authoring as new, import when supported, additional authoring commands, and publish. Human and machine help shall preserve these groups and order.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "extension-adoption"],
  methods: ["contract", "decision-table"],
  derivedFrom: ["cli/command-help-is-complete"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const roles = [
  { type: "skills", manage: ["handoff"], author: ["import"] },
  { type: "subagents", manage: [], author: ["import"] },
  { type: "mcps", manage: ["add", "adopt"], author: ["import"] },
  { type: "rules", manage: [], author: [] },
  { type: "hooks", manage: ["configure"], author: ["import", "test", "export"] },
  { type: "knowledge", manage: ["concepts"], author: ["lint"] },
  { type: "packs", manage: ["add", "remove"], author: ["unpack"] },
];

for (const role of roles) {
  it.effect(`groups ${role.type} commands by their purpose`, () =>
    Effect.gen(function* () {
      const help = toJsonHelpDoc(yield* captureHelpDoc([role.type]));
      expect(
        help.subcommands?.map(({ group, commands }) => ({
          group,
          names: commands.map(({ name }) => name),
        })),
      ).toEqual([
        {
          group: `MANAGE ${role.type.toUpperCase()}`,
          names: [
            "install",
            "update",
            "uninstall",
            "list",
            "show",
            "enable",
            "disable",
            ...role.manage,
          ],
        },
        { group: `AUTHOR ${role.type.toUpperCase()}`, names: ["new", ...role.author, "publish"] },
      ]);
    }),
  );
}
