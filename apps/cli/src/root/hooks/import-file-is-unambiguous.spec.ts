import * as Effect from "effect/Effect";
import { expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { captureHelpDoc } from "../../test-support/command-tree-test-helpers.js";
import { probeFlag } from "../../test-support/parser-probe.js";
import { toJsonHelpDoc } from "../../cli-runtime/index.js";

export const specification = defineSpecification({
  requirement: "cli/hooks/import-file-is-unambiguous",
  title: "Hook import distinguishes the definition file from inline configuration",
  statement:
    "Hook import shall accept a source directory and destination extension, expose --file with default hooks.json for the source definition file, and reject --config and --configuration. Inline --configuration shall remain available on hook install, configure, and test.",
  class: "functional",
  role: "interface",
  goals: ["actionable-diagnostics", "machine-automation"],
  methods: ["contract", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

it.effect("names the file and inline configuration distinctly", () =>
  Effect.gen(function* () {
    const path = ["hooks", "import"];
    const help = toJsonHelpDoc(yield* captureHelpDoc(path));
    expect(help.usage).toBe("axm hooks import [flags] <directory> <extension>");
    expect(help.flags).toContainEqual(
      expect.objectContaining({
        name: "file",
        default: "hooks.json",
        description: "JSON file relative to <directory>",
      }),
    );
    expect(yield* probeFlag(path, "--file")).toBe("accepted");
    expect(yield* probeFlag(path, "--config")).toBe("unrecognized");
    expect(yield* probeFlag(path, "--configuration")).toBe("unrecognized");
    for (const command of ["install", "configure", "test"])
      expect(yield* probeFlag(["hooks", command], "--configuration")).toBe("accepted");
  }),
);
