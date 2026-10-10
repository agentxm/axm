import * as Effect from "effect/Effect";
import { expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { captureHelpDoc } from "../../test-support/command-tree-test-helpers.js";
import { probeFlag } from "../../test-support/parser-probe.js";
import { toJsonHelpDoc } from "../../cli-runtime/index.js";

export const specification = defineSpecification({
  requirement: "cli/diagnostics/export-names-its-destination",
  title: "Diagnostic export names its source and destination as positionals",
  statement:
    "Diagnostic export shall require the diagnostic ID and destination as positionals, followed by no further positional inputs, and require --review-sha256 for the reviewed record. It shall reject --output. Help shall identify the destination as a new local file that is never uploaded and identify the review hash as required.",
  class: "functional",
  role: "interface",
  goals: ["privacy-and-consent", "actionable-diagnostics"],
  methods: ["contract"],
  derivedFrom: ["system/reliability/failure-diagnostics-can-be-reviewed-and-exported"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

it.effect("exposes an explicit destination and required review hash", () =>
  Effect.gen(function* () {
    const path = ["diagnostics", "export"];
    const help = toJsonHelpDoc(yield* captureHelpDoc(path));
    expect(help.usage).toBe("axm diagnostics export [flags] <id> <destination>");
    expect(
      help.args?.map(({ name, required, variadic }) => ({ name, required, variadic })),
    ).toEqual([
      { name: "id", required: true, variadic: undefined },
      { name: "destination", required: true, variadic: undefined },
    ]);
    expect(help.args?.find(({ name }) => name === "destination")?.description).toBe(
      "New local file for the reviewed record; never uploaded",
    );
    expect(help.flags.find(({ name }) => name === "review-sha256")?.required).toBe(true);
    expect(yield* probeFlag(path, "--output")).toBe("unrecognized");
  }),
);
