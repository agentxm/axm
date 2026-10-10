import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";
import { toJsonHelpDoc } from "../../cli-runtime/index.js";
import { collectHelpFiles } from "../../test-support/command-tree-test-helpers.js";
import { parseInvocation } from "../../test-support/parser-probe.js";
import { EXTENSION_TYPE_PRESENTATION } from "../extension-type-presentation.js";

export const specification = defineSpecification({
  requirement: "cli/help/parameter-grammar-is-explicit",
  title: "Parameter help distinguishes names, FQNs, selectors and query defaults",
  statement:
    "FQN help shall name the @owner/<plural-type>/<name> form. Type verbs shall name their subject and action, distinguish activation names or FQNs from uninstall names or globs, and state that creation names omit owners. Pack show, add and remove shall use a name slot for configured pack names or unique configured FQNs, with installed-member selection for add and declared-dependency selection for remove. Typed update shall state its omitted selection. Query shorthand help shall name its canonical metadata or lifecycle form and its unset defaults. Page cursors shall name continuation, token revoke shall use ID, and dependency qualifiers shall state only-with, required-when, implied or excluded inputs.",
  class: "functional",
  role: "interface",
  goals: ["actionable-diagnostics", "machine-automation", "knowledge-access"],
  methods: ["contract", "decision-table"],
  derivedFrom: ["cli/help/parameters-share-metadata"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Explicit parameter grammar", () => {
  it.effect("names typed subjects and their selector grammar", () =>
    Effect.gen(function* () {
      const files = new Map(
        Array.from(yield* collectHelpFiles(), ([route, doc]) => [route, toJsonHelpDoc(doc)]),
      );
      for (const { route, noun } of Object.values(EXTENSION_TYPE_PRESENTATION)) {
        for (const [verb, description] of [
          ["new", `Name of the ${noun.singular} to create, without owner`],
          ["enable", `Name or FQN of the ${noun.singular} to enable`],
          ["disable", `Name or FQN of the ${noun.singular} to disable`],
          ["uninstall", `Name or glob of the ${noun.singular} to uninstall`],
          ["update", "Installed name or glob; omit to update all"],
          [
            "show",
            route === "packs"
              ? "Configured pack name or unique configured pack FQN"
              : `Name of the ${noun.singular} to show`,
          ],
        ]) {
          expect(
            files.get(`axm ${route} ${verb}`)?.args?.find(({ name }) => name === "name")
              ?.description,
            `${route} ${verb}`,
          ).toBe(description);
        }
      }
      for (const verb of ["show", "add", "remove"]) {
        expect(files.get(`axm packs ${verb}`)?.args?.[0]).toMatchObject({
          name: "name",
          description: "Configured pack name or unique configured pack FQN",
        });
      }
      expect(files.get("axm packs add")?.args?.[1]?.description).toBe(
        "Installed extension FQN, name, or glob over names",
      );
      expect(files.get("axm packs remove")?.args?.[1]?.description).toBe(
        "Declared dependency FQN or glob over FQNs",
      );
      expect(files.get("axm mcps add")?.args?.[0]?.description).toBe(
        "Name of the MCP server to add",
      );
      expect(files.get("axm hooks configure")?.args?.[0]?.description).toBe(
        "Name of the hook extension to configure",
      );
      expect(files.get("axm hooks configure")?.description).toContain("installed hook extension");
      expect(files.get("axm hooks test")?.args?.[0]?.description).toContain(
        "Hook extension directory",
      );
      expect(files.get("axm hooks export")?.args?.[0]?.description).toBe(
        "Hook extension directory",
      );
      expect(files.get("axm packs unpack")?.args?.[0]?.description).toBe(
        "Name of the pack to unpack",
      );
    }),
  );

  it.effect("uses one FQN form and names query shorthand and continuation defaults", () =>
    Effect.gen(function* () {
      const files = new Map(
        Array.from(yield* collectHelpFiles(), ([route, doc]) => [route, toJsonHelpDoc(doc)]),
      );
      for (const route of [
        "adopt",
        "demote",
        "version",
        "archive",
        "unarchive",
        "deprecate",
        "undeprecate",
        "visibility status",
        "visibility set",
        "visibility reconcile",
        "enable",
        "disable",
      ]) {
        expect(files.get(`axm ${route}`)?.args?.[0]?.description, route).toBe(
          "Extension FQN in @owner/<plural-type>/<name> form",
        );
      }
      const query = files.get("axm knowledge concepts query");
      for (const [name, description] of [
        ["kind", "Document kind, as --metadata kind=KIND; unset returns concept documents only"],
        ["status", "Lifecycle status, as --lifecycle status=STATUS; unset excludes deprecated"],
        ["tag", "Require an exact tag, as --metadata tag=TAG"],
        ["bundle", "Require an exact Knowledge bundle FQN, as --metadata bundle=FQN"],
      ])
        expect(query?.flags.find((flag) => flag.name === name)?.description, name).toBe(
          description,
        );
      for (const route of ["knowledge concepts query", "token list"])
        expect(
          files.get(`axm ${route}`)?.flags.find(({ name }) => name === "cursor")?.description,
        ).toBe("Continue from the cursor returned by the previous page");
      expect(files.get("axm token revoke")?.args?.[0]?.description).toBe("Token ID to revoke");
      expect(
        files.get("axm setup")?.flags.find(({ name }) => name === "scope")?.description,
      ).toContain("; required when ");
      expect(
        files.get("axm subagents import")?.flags.find(({ name }) => name === "source-agent")
          ?.description,
      ).toContain("; required when ");
    }),
  );

  it.effect("retains distinct replacement and local unpack examples", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      expect(files.get("axm packs unpack")?.examples?.map(({ command }) => command)).toEqual([
        "axm packs unpack frontend-tools",
        "axm packs unpack frontend-tools --preview",
      ]);
      expect(files.get("axm demote")?.examples?.[0]?.command).toBe(
        "axm demote @acme/skills/code-review @upstream/skills/code-review",
      );
      yield* parseInvocation(["list", "--type", "skill", "--type", "hook"]);
      yield* parseInvocation(["sync", "--type", "skill", "--type", "subagent"]);
    }),
  );
});
