import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";

import {
  StepFailure,
  makeOperationResolution,
  operationPresentation,
  type JobStepArtifact,
  type OperationErrorCategory,
  type OperationResolution,
  type ResolvedUnit,
} from "@agentxm/workspace/transitions/planning";

import { defineSpecification } from "@agentxm/specification-metadata";

import { operationDoc, unsettledUnits } from "./operation-view.js";
import { RETRYABLE_FAILURE_CATEGORIES, retryCanHelp } from "./operation-output.js";
import { paintText } from "./screen/paint-text.js";

export const specification = defineSpecification({
  requirement: "cli/non-success-results-name-a-fitting-recovery",
  title: "A result that did not succeed names a recovery that fits it",
  statement:
    "When an operation settles partial, failed, blocked, or interrupted, its `Next` shall name at least one recovery that fits the outcome — the emitting command narrowed to the units that did not settle where an unchanged retry can help, or a recovery the producer of a failure stated — and shall not consist solely of a generic inventory suggestion; where no command can change the outcome, it shall offer no retry.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "extension-adoption"],
  boundary: "memory",
  boundaryRationale:
    "The recovery is derived from the settled resolution and the adapter's own route spelling, both in memory. Which blocker a command's own refusal admits is the emitting feature's and is not decided here.",
  methods: ["example", "decision-table"],
  derivedFrom: ["cli/unsettled-units-state-their-reason"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "Examples drive the shared operation document and the retry policy. That each adapter spells its own route correctly is witnessed by that adapter's tests.",
      retirementCondition:
        "Bind adapter evidence here when a route's spelling becomes an accepted obligation of its own.",
    },
  ],
});

const presentation = operationPresentation({
  imperative: "update",
  past: "Updated",
  gerund: "Updating",
});

const artifact = (previousVersion: string): JobStepArtifact => ({
  path: "agent_extensions/reviewer",
  scope: "project",
  change: "updated",
  previousVersion,
});

const failedUnit = (
  id: string,
  category: OperationErrorCategory,
  suggestions?: ReadonlyArray<{ readonly description: string; readonly cmd?: string }>,
): ResolvedUnit<unknown> => ({
  id,
  label: `skills/${id}`,
  state: "failed",
  disposition: "restored",
  message: `${id} did not update. (${category})`,
  error: new StepFailure({
    category,
    detail: `${id} did not update.`,
    ...(suggestions === undefined ? {} : { suggestions }),
  }),
  artifact: artifact("1.0.0"),
});

const committedUnit = (id: string): ResolvedUnit<unknown> => ({
  id,
  label: `skills/${id}`,
  state: "committed",
  artifact: { ...artifact("1.0.0"), version: "1.1.0" },
});

const resolutionOf = (units: ReadonlyArray<ResolvedUnit<unknown>>): OperationResolution<unknown> =>
  makeOperationResolution({
    name: "Update extensions",
    description: Option.none(),
    mode: "apply",
    presentation,
    atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
    units,
  });

/** The `Next` lines of a painted result, without the label above them. */
const nextLines = (
  resolution: OperationResolution<unknown>,
  suggestions: ReadonlyArray<{ readonly description: string; readonly cmd?: string }>,
): ReadonlyArray<string> => {
  const lines = paintText(operationDoc(resolution, { verbosity: "normal", suggestions }), {
    width: 100,
    colors: false,
  });
  const start = lines.indexOf("Next");
  return start === -1 ? [] : lines.slice(start + 1).filter((line) => line.trim().length > 0);
};

const INVENTORY = { description: "Inspect installed extensions", cmd: "axm list" } as const;
const RETRY = { description: "Try the extensions that did not update again", cmd: "axm update" };

describe("A non-success result names a fitting recovery", () => {
  it("reports which units an adapter has to recover", () => {
    const resolution = resolutionOf([
      committedUnit("spot-spew"),
      failedUnit("research", "network"),
      failedUnit("okf", "forbidden"),
    ]);
    expect(unsettledUnits(resolution).map((unit) => unit.id)).toEqual(["research", "okf"]);
  });

  it.each([...RETRYABLE_FAILURE_CATEGORIES])(
    "offers the emitting route again for a %s failure",
    (category) => {
      const resolution = resolutionOf([
        committedUnit("spot-spew"),
        failedUnit("research", category),
      ]);
      expect(retryCanHelp(unsettledUnits(resolution))).toBe(true);
      const lines = nextLines(resolution, [RETRY]);
      expect(lines.join("\n")).toContain("axm update");
      expect(lines.join("\n")).not.toContain("axm list");
    },
  );

  it.each(["forbidden", "conflict", "validation", "not_found", "quota"] as const)(
    "offers no retry for a %s failure, which a rerun cannot change",
    (category) => {
      const resolution = resolutionOf([failedUnit("research", category)]);
      expect(retryCanHelp(unsettledUnits(resolution))).toBe(false);
    },
  );

  it("never settles non-success with only a generic inventory suggestion", () => {
    const resolution = resolutionOf([
      committedUnit("spot-spew"),
      failedUnit("research", "network"),
    ]);
    const lines = nextLines(resolution, [RETRY, INVENTORY]);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((line) => line.includes("axm update"))).toBe(true);
  });

  it("names every failed unit's own recovery, not only the first", () => {
    const resolution = resolutionOf([
      failedUnit("research", "conflict", [
        { description: "Resolve the source again", cmd: "axm update skills/research --refresh" },
      ]),
      failedUnit("okf", "conflict", [
        { description: "Resolve the source again", cmd: "axm update skills/okf --refresh" },
      ]),
    ]);
    const painted = nextLines(resolution, []).join("\n");
    expect(painted).toContain("axm update skills/research --refresh");
    expect(painted).toContain("axm update skills/okf --refresh");
  });

  it("keeps the inventory suggestion where every unit settled as planned", () => {
    const resolution = resolutionOf([committedUnit("spot-spew")]);
    expect(unsettledUnits(resolution)).toEqual([]);
    expect(nextLines(resolution, [INVENTORY]).join("\n")).toContain("axm list");
  });
});
