import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  makeOperationResolution,
  type JobStepArtifact,
  type Plan,
} from "@agentxm/workspace-operations";

import { operationDoc, planDoc } from "./operation-view.js";
import { asciiGlyphs, paintText } from "./screen/paint-text.js";

describe("pack membership output", () => {
  const artifact: JobStepArtifact = {
    path: "packs/toolkit/pack.json",
    scope: "project",
    change: "updated",
    packMembership: {
      pack: "@acme/packs/toolkit",
      members: [
        { member: "@acme/skills/added", before: null, after: ">=1.0.0" },
        { member: "@acme/skills/removed", before: ">=2.0.0", after: null },
        { member: "@acme/skills/updated", before: ">=1.0.0", after: ">=2.0.0" },
      ],
    },
  };
  it.each(["preview", "apply"] as const)(
    "renders resolved member and constraint changes for %s",
    (mode) => {
      const plan: Plan = {
        _tag: "Plan",
        name: "Change membership",
        description: Option.none(),
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                readiness: "ready",
                label: "toolkit",
                artifact,
                run: Effect.succeed({ result: "success", message: "Updated toolkit", artifact }),
              },
            ],
          },
        ],
      };
      const resolution = makeOperationResolution({
        name: plan.name,
        description: plan.description,
        mode,
        atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
        units: [{ id: "toolkit", label: "toolkit", state: "committed", artifact }],
      });
      const doc =
        mode === "preview"
          ? planDoc(plan, { mode, verbosity: "normal" })
          : operationDoc(resolution, { verbosity: "normal" });
      const text = paintText(doc, { width: 160, colors: false, glyphs: asciiGlyphs }).join("\n");
      expect(text).toContain("@acme/packs/toolkit");
      expect(text).toMatch(/\+ @acme\/skills\/added\s+>=1\.0\.0/);
      expect(text).toMatch(/- @acme\/skills\/removed\s+>=2\.0\.0/);
      expect(text).toMatch(/~ @acme\/skills\/updated\s+>=1\.0\.0 to >=2\.0\.0/);
    },
  );
});
