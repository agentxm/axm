import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { rootCommand } from "../../app.js";
import { makeCliReferenceDocument, type CliCommandReference } from "../../cli-reference.js";
import { parameterHelpLine } from "../../cli-parameters.js";
import { toJsonHelpDoc } from "../../cli-runtime/index.js";
import { collectHelpFiles } from "../../test-support/command-tree-test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/help/parameters-share-metadata",
  title: "Human help and machine references share parameter facts",
  statement:
    "Command help, machine help, and the CLI reference shall describe each parameter through one schema with its name, aliases, type, requiredness, description, value name, repeat bounds, choices, default, and numeric range when applicable. Choice sets of at most twelve shall render inline; larger choice sets shall reference their help while machine records retain every choice. Human facts shall follow choices or range, default, repeatable, and required, without marking optional arguments as required. Usage shall put flags before leaf positionals, and group usage shall name a subcommand. Every workspace scope flag shall share its description, choices, and default.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["contract", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const flattenReference = (
  command: CliCommandReference,
  parent = "",
): ReadonlyArray<readonly [string, CliCommandReference]> => {
  const path = `${parent} ${command.name}`.trim();
  return [
    [path, command],
    ...command.subcommands.flatMap((child) => flattenReference(child, path)),
  ];
};

describe("Shared parameter records", () => {
  it.effect("agrees with reference generation across the registered tree", () =>
    Effect.gen(function* () {
      const reference = new Map(
        flattenReference(makeCliReferenceDocument(rootCommand, "0.0.0-test").command),
      );
      for (const [path, native] of yield* collectHelpFiles()) {
        const help = toJsonHelpDoc(native);
        const row = reference.get(path);
        expect(row, path).toBeDefined();
        expect(help.flags, path).toEqual(row?.options);
        expect(help.args ?? [], path).toEqual(row?.arguments);
        // Built-in help/version are owned by Effect; AXM's own globals use the
        // same records as reference generation.
        expect(
          help.globalFlags?.filter((flag) =>
            row?.globalOptions.some(({ name }) => name === flag.name),
          ),
          path,
        ).toEqual(row?.globalOptions);
        const scope = help.flags.find((flag) => flag.name === "scope");
        if (scope !== undefined && path !== "axm setup") {
          expect(scope, path).toMatchObject({
            description: "Workspace scope",
            choices: [{ value: "project" }, { value: "user" }],
            default: "project",
          });
        }
        if ((help.subcommands?.length ?? 0) > 0) {
          expect(help.usage, path).toBe(
            `${path} <${path === "axm" ? "command" : "subcommand"}> [flags]`,
          );
        } else {
          const positionals = (help.args ?? []).map((arg) => {
            const name = `<${arg.name}>${arg.variadic === undefined ? "" : "..."}`;
            return arg.required ? name : `[${name}]`;
          });
          expect(help.usage, path).toBe([`${path} [flags]`, ...positionals].join(" "));
        }
      }
    }),
  );

  it.effect("references large choice sets while retaining all machine choices", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      for (const [path, native] of files) {
        for (const parameter of toJsonHelpDoc(native).flags) {
          if (parameter.choices === undefined) continue;
          const line = parameterHelpLine(parameter);
          if (parameter.choices.length > 12) {
            expect(line, `${path}: ${parameter.name}`).toContain(
              `choices: see ${parameter.name === "ecosystem" ? "axm help package-extensions" : "axm agents list --available"}`,
            );
          } else {
            expect(line, `${path}: ${parameter.name}`).toContain(
              `choices: ${parameter.choices.map(({ value }) => value).join(", ")}`,
            );
          }
        }
      }
    }),
  );

  it.effect("publishes actual page and evidence defaults and bounds", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      for (const [path, name, min, max, defaultValue] of [
        ["axm token list", "limit", 1, 100, 50],
        ["axm knowledge concepts related", "depth", 1, 3, 1],
        ["axm knowledge concepts query", "limit", 1, 100, 25],
        ["axm knowledge concepts query", "passages", 0, 10, 3],
        ["axm knowledge concepts query", "passage-length", 1, 2000, 500],
      ] as const) {
        const native = files.get(path);
        if (native === undefined) return yield* Effect.die(new Error(`Missing ${path}`));
        const flag = toJsonHelpDoc(native).flags.find((flag) => flag.name === name);
        expect(flag, `${path} --${name}`).toMatchObject({
          required: false,
          default: defaultValue,
          range: { min, max },
        });
        if (flag !== undefined)
          expect(parameterHelpLine(flag)).toContain(`(${min}-${max}; default ${defaultValue})`);
      }
    }),
  );
});
