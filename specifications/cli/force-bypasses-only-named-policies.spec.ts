import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";

import { collectHelpFiles } from "axm.sh/unstable/specification-harness";

import { defineSpecification } from "../support/contract.js";

export const specification = defineSpecification({
  requirement: "cli/force-bypasses-only-named-policies",
  title: "Force flags exist only for explicitly named forceable policies",
  class: "functional",
  intents: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["contract"],
});

/**
 * Every override flag the CLI exposes and the exact policy its help names.
 * Adding an override means naming its policy here — a generic "force it"
 * flag cannot enter the surface silently.
 */
const NAMED_OVERRIDE_FLAGS: Readonly<Record<string, string>> = {
  "--reinstall": "reinstall",
  "--ignore-release-age": "release",
};

describe("Override flags", () => {
  it.effect("every override flag documents the one policy it bypasses", () =>
    Effect.gen(function* () {
      const helpFiles = yield* collectHelpFiles();
      const undocumented: string[] = [];
      for (const [commandPath, doc] of helpFiles) {
        for (const flag of doc.flags) {
          const rendered = `--${flag.name}`;
          if (rendered === "--force") {
            undocumented.push(`${commandPath}: bare --force flag`);
            continue;
          }
          if (rendered in NAMED_OVERRIDE_FLAGS) {
            const policyWord = NAMED_OVERRIDE_FLAGS[rendered] ?? "";
            const description = Option.getOrElse(flag.description, () => "").toLowerCase();
            if (!description.includes(policyWord)) {
              undocumented.push(`${commandPath}: ${rendered} does not name its policy`);
            }
          }
        }
      }
      expect(undocumented).toEqual([]);
    }),
  );
});
