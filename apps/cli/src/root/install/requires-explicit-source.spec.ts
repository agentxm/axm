import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { CliError } from "effect/cli";
import { defineSpecification } from "@agentxm/specification-metadata";

import { captureHelpDoc } from "../../test-support/command-tree-test-helpers.js";
import { parserRejection, probeFlag } from "../../test-support/parser-probe.js";
import { toJsonHelpDoc } from "../../cli-runtime/index.js";

export const specification = defineSpecification({
  requirement: "cli/install/requires-explicit-source",
  title: "Installation requires an explicit source",
  statement:
    "Root install and all seven type-specific install commands shall require a source and shall reject --reinstall. They shall acquire from that explicit source, rather than treating source omission as a configured workspace sweep. Help shall describe source acquisition and show required source usage.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "machine-automation"],
  methods: ["contract", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const routes = [
  [],
  ["skills"],
  ["mcps"],
  ["subagents"],
  ["hooks"],
  ["rules"],
  ["knowledge"],
  ["packs"],
] as const;

describe("Explicit installation source", () => {
  for (const prefix of routes) {
    const path = [...prefix, "install"];
    it.effect(`requires a source on axm ${path.join(" ")}`, () =>
      Effect.gen(function* () {
        const failure = yield* parserRejection(path);
        expect(CliError.isCliError(failure)).toBe(true);
        if (CliError.isCliError(failure) && failure._tag === "ShowHelp") {
          expect(
            failure.errors.some(
              (error) => error._tag === "MissingArgument" && error.argument === "source",
            ),
          ).toBe(true);
        } else return yield* Effect.die(new Error("Expected missing-source parser rejection"));
        const help = toJsonHelpDoc(yield* captureHelpDoc(path));
        expect(help.args).toContainEqual(
          expect.objectContaining({ name: "source", required: true }),
        );
        expect(help.usage).toBe(`axm ${path.join(" ")} [flags] <source>`);
        expect(help.description).not.toContain("Reinstall all configured");
        expect(yield* probeFlag(path, "--reinstall")).toBe("unrecognized");
      }),
    );
  }
});
