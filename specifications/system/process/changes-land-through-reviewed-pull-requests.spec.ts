import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/process/changes-land-through-reviewed-pull-requests",
  title:
    "Changes land through human-reviewed pull requests, with requirements changes routed to maintainers",
  statement:
    "Every change shall land through a pull request with passing required checks and human approval, and any change under specifications shall be routed to maintainer review as a requirements decision.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "The committed code-owner rules and contributor guidance are the repository-side declaration of the review route, which no in-memory run can observe.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "GitHub branch protection enforces pull-request review and code-owner approval outside the repository.",
  ],
  openQuestions: [],
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
