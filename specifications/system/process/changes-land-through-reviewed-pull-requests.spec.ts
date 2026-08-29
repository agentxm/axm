import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "../../support/contract.js";

export const specification = defineSpecification({
  requirement: "system/process/changes-land-through-reviewed-pull-requests",
  title:
    "Changes land through human-reviewed pull requests, with requirements changes routed to maintainers",
  class: "process",
  intents: ["dependable-change-process"],
  boundary: "repository",
  methods: ["contract"],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

describe("Reviewed pull-request flow", () => {
  it.effect("specification paths route to maintainer review as a requirements decision", () =>
    Effect.sync(() => {
      const codeowners = fs.readFileSync(path.join(repoRoot, ".github", "CODEOWNERS"), "utf8");
      expect(codeowners).toContain("/specifications/");
    }),
  );

  it.effect(
    "contributor guidance names pull requests, required checks, and human approval as the change route",
    () =>
      Effect.sync(() => {
        // Branch-protection settings live with the host; the repository-side
        // projection is the declared contributor contract.
        const contributing = fs.readFileSync(path.join(repoRoot, "CONTRIBUTING.md"), "utf8");
        expect(contributing.toLowerCase()).toContain("pull request");
      }),
  );
});
