import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { packageMetadataEcosystems } from "@agentxm/workspace-features/sharing";
import { captureHelpDoc } from "../../test-support/command-tree-test-helpers.js";
import { probeFlag } from "../../test-support/parser-probe.js";
import { toJsonHelpDoc } from "../../cli-runtime/index.js";

export const specification = defineSpecification({
  requirement: "cli/share/selection-is-explicit",
  title: "Share selects one ecosystem and uses the global execution directory",
  statement:
    "Share shall take no directory positional and shall expose one optional, nonrepeatable --ecosystem choice over supported package metadata ecosystems, rejecting the former ecosystem boolean flags. Discover shall reject --path. Both routes shall use the execution directory selected by global -C.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["contract", "decision-table"],
  derivedFrom: ["cli/commands-use-selected-directory"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Share selection grammar", () => {
  it.effect("exposes one supported ecosystem choice and no directory", () =>
    Effect.gen(function* () {
      const help = toJsonHelpDoc(yield* captureHelpDoc(["share"]));
      expect(help.args ?? []).toEqual([]);
      expect(help.usage).toBe("axm share [flags]");
      const ecosystem = help.flags.find((flag) => flag.name === "ecosystem");
      expect(ecosystem?.required).toBe(false);
      expect(ecosystem?.variadic).toBeUndefined();
      expect(ecosystem?.choices?.map(({ value }) => value)).toEqual(packageMetadataEcosystems);
      expect(yield* probeFlag(["share"], "--ecosystem")).toBe("accepted");
      for (const value of packageMetadataEcosystems)
        expect(yield* probeFlag(["share"], `--${value}`)).toBe("unrecognized");
    }),
  );
  it.effect("discover takes its directory only through the global selector", () =>
    Effect.gen(function* () {
      const help = toJsonHelpDoc(yield* captureHelpDoc(["discover"]));
      expect(help.args ?? []).toEqual([]);
      expect(yield* probeFlag(["discover"], "--path")).toBe("unrecognized");
    }),
  );
});
