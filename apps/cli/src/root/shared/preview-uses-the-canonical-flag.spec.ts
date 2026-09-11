import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { collectHelpFiles } from "../../test-support/command-tree-test-helpers.js";

import { defineSpecification } from "@agentxm/specification-metadata";
import { COMMAND_ROUTE_ALLOCATION, formatRoute } from "../../test-support/command-routes.js";
import { probeFlag } from "../../test-support/parser-probe.js";

export const specification = defineSpecification({
  requirement: "cli/preview-uses-the-canonical-flag",
  title: "Assessment is spelled --preview everywhere it exists and nowhere else",
  statement:
    "Every command that assesses its change without applying it shall accept --preview and no alternative spelling, every command without an assessment shall reject --preview, every command that offers preapproval shall accept --yes while every command without one shall reject it, and rendered help shall list --preview and --yes on exactly the commands whose capabilities declare them.",
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
const PREAPPROVAL = "--yes";
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

  // Preapproval is a second flag surface over the same allocation: a route
  // that cannot be preapproved must refuse --yes at parse time, not accept it
  // and ignore it.
  it.effect("is accepted by exactly the routes that offer preapproval", () =>
    Effect.gen(function* () {
      const disagreements: Array<string> = [];
      for (const route of COMMAND_ROUTE_ALLOCATION) {
        const outcome = yield* probeFlag(route.path, PREAPPROVAL);
        const expected = route.preapproval ? "accepted" : "unrecognized";
        if (outcome !== expected) {
          disagreements.push(`${formatRoute(route.path)}: ${outcome}, allocation says ${expected}`);
        }
      }
      expect(disagreements).toEqual([]);
      expect(COMMAND_ROUTE_ALLOCATION.filter((route) => route.preapproval).length).toBeGreaterThan(
        0,
      );
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
