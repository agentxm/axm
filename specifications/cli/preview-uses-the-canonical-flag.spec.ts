import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { collectHelpFiles } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { COMMAND_ROUTE_ALLOCATION, formatRoute } from "../support/command-routes.js";
import { probeFlag } from "../support/parser-probe.js";

export const specification = defineSpecification({
  requirement: "cli/preview-uses-the-canonical-flag",
  title: "Assessment is spelled --preview everywhere it exists and nowhere else",
  statement:
    "Every command that assesses its change without applying it shall accept --preview and no alternative spelling, every command without an assessment shall reject --preview, and rendered help shall list --preview and --yes on exactly the commands whose capabilities declare them.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation"],
  methods: ["contract"],
  derivedFrom: ["cli/command-help-is-complete"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const PREVIEW = "--preview";
const RETIRED_SPELLING = "--dry-run";

describe("The canonical assessment flag", () => {
  it.effect("is accepted by exactly the routes that assess", () =>
    Effect.gen(function* () {
      const disagreements: Array<string> = [];
      for (const route of COMMAND_ROUTE_ALLOCATION) {
        const outcome = yield* probeFlag(route.path, PREVIEW);
        const expected = route.preview ? "accepted" : "unrecognized";
        if (outcome !== expected) {
          disagreements.push(`${formatRoute(route.path)}: ${outcome}, allocation says ${expected}`);
        }
      }
      expect(disagreements).toEqual([]);
      expect(COMMAND_ROUTE_ALLOCATION.filter((route) => route.preview).length).toBeGreaterThan(60);
    }),
  );

  it.effect("upgrade assesses under --preview and no longer answers to its retired spelling", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["upgrade"], PREVIEW)).toBe("accepted");
      expect(yield* probeFlag(["upgrade"], RETIRED_SPELLING)).toBe("unrecognized");
    }),
  );

  it.effect(
    "rendered help lists the assessment and approval flags on exactly the declaring routes",
    () =>
      Effect.gen(function* () {
        const helpFiles = yield* collectHelpFiles();
        const disagreements: Array<string> = [];
        for (const route of COMMAND_ROUTE_ALLOCATION) {
          const spelling = formatRoute(route.path);
          const doc = helpFiles.get(spelling);
          if (doc === undefined) {
            disagreements.push(`${spelling}: no rendered help`);
            continue;
          }
          const flagNames = new Set(doc.flags.map((flag) => flag.name));
          if (flagNames.has("preview") !== route.preview) {
            disagreements.push(
              `${spelling}: help ${flagNames.has("preview") ? "lists" : "omits"} --preview`,
            );
          }
          if (flagNames.has("yes") !== route.preapproval) {
            disagreements.push(
              `${spelling}: help ${flagNames.has("yes") ? "lists" : "omits"} --yes`,
            );
          }
        }
        expect(disagreements).toEqual([]);
      }),
  );
});
