import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { defineSpecification } from "@agentxm/specification-metadata";
import { captureHelpDoc } from "../../test-support/command-tree-test-helpers.js";
import { probeFlag } from "../../test-support/parser-probe.js";

export const specification = defineSpecification({
  requirement: "cli/new/creation-inputs-are-consistent",
  title: "Creation commands share their discovery summary input",
  statement:
    "All seven type-specific new commands shall expose one optional string --description, described as Short registry-facing summary shown in listings and search results. Only rules new shall accept --title.",
  class: "functional",
  role: "interface",
  goals: ["authoring-and-creation", "machine-automation"],
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Creation inputs", () => {
  it.effect.each(["skills", "mcps", "subagents", "hooks", "rules", "knowledge", "packs"])(
    "%s offers the shared optional description and only rules offers title",
    (type) =>
      Effect.gen(function* () {
        const doc = yield* captureHelpDoc([type, "new"]);
        const summaries = doc.flags.filter((flag) => flag.name === "description");
        expect(summaries).toHaveLength(1);
        expect(summaries[0]).toMatchObject({ type: "string", required: false });
        expect(Option.getOrUndefined(summaries[0]?.description ?? Option.none())).toBe(
          "Short registry-facing summary shown in listings and search results",
        );
        expect(yield* probeFlag([type, "new"], "--title")).toBe(
          type === "rules" ? "accepted" : "unrecognized",
        );
      }),
  );
});
