import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";

import {
  makeOperationResolution,
  operationPresentation,
  type JobStepArtifact,
  type OperationResolution,
  type ResolvedUnit,
} from "@agentxm/workspace/transitions/planning";

import { defineSpecification } from "@agentxm/specification-metadata";

import { operationDoc } from "./operation-view.js";
import { paintText } from "./screen/paint-text.js";
import type { PaintWidth } from "./screen/paint-text.js";
import { partialUpdate } from "./test-support/gallery/samples/operation-stress.js";

export const specification = defineSpecification({
  requirement: "cli/unsettled-units-state-their-reason",
  title: "A unit that did not settle as planned says why, and what it was left in",
  statement:
    "For every unit of a settled operation that did not settle as planned, human output shall state that unit's reason in full beside its row and shall state whether the unit's prior state was kept, restored, or left incomplete, at every bounded terminal width AXM supports, on an unbounded stream, and at normal as well as verbose detail; a unit the operation never reached shall state what stopped it, and a unit whose producer supplied no reason shall state that rather than showing nothing.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "extension-adoption"],
  boundary: "memory",
  boundaryRationale:
    "The reason is the sentence a producer settled its unit with, carried on the resolution. Which units fail, and why, belongs to those producers and is not decided here.",
  methods: ["example", "property"],
  derivedFrom: ["cli/mutations-are-closure-atomic"],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Whether quiet output keeps an unsettled unit's reason is recorded on `cli/diagnostic-controls-select-the-requested-detail` and is not decided here.",
  ],
  limitations: [
    {
      limitation:
        "Examples and the property drive the settled operation document. That a producer settles a failed unit with a reason at all is witnessed by the producers' own tests, not decided here.",
      retirementCondition:
        "Bind producer evidence here if a producer is ever allowed to settle a unit unsettled without a stated reason.",
    },
  ],
});

/** The widths a supported terminal takes, and the stream that has none. */
const WIDTHS: ReadonlyArray<PaintWidth> = [40, 60, 80, 100, 120, "unbounded"];

const VERBOSITIES = ["normal", "verbose"] as const;

const presentation = operationPresentation({
  imperative: "update",
  past: "Updated",
  gerund: "Updating",
});

const artifact = (version: string): JobStepArtifact => ({
  path: "agent_extensions/reviewer",
  scope: "project",
  change: "updated",
  previousVersion: version,
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

/**
 * The painted document with its whitespace removed. Wrapping is the painter's
 * business: what this specification requires is that the text is all there,
 * not which line each word landed on.
 */
const compact = (value: string): string => value.replaceAll(/\s+/gu, "");

const paintedAt = (
  resolution: OperationResolution<unknown>,
  width: PaintWidth,
  verbosity: "normal" | "verbose",
): string =>
  compact(paintText(operationDoc(resolution, { verbosity }), { width, colors: false }).join("\n"));

/** Every bounded width, the unbounded stream, and both detail levels. */
const everywhere = (
  resolution: OperationResolution<unknown>,
  check: (painted: string, where: string) => void,
): void => {
  for (const width of WIDTHS) {
    for (const verbosity of VERBOSITIES) {
      check(paintedAt(resolution, width, verbosity), `${String(width)} ${verbosity}`);
    }
  }
};

const REGISTRY_REFUSED =
  "The registry refused the request while resolving @acme/subagents/reviewer, and the installed version is still in place.";

/**
 * One unit per way a unit can fail to settle, and the reason each one owes its
 * reader. Every row of this table is required at every width and verbosity.
 */
const cases: ReadonlyArray<{
  readonly name: string;
  readonly unit: ResolvedUnit<unknown>;
  readonly reason: string;
}> = [
  {
    name: "a failed unit states the reason its producer settled it with",
    unit: {
      id: "reviewer",
      label: "@acme/subagents/reviewer",
      state: "failed",
      disposition: "restored",
      message: REGISTRY_REFUSED,
      artifact: artifact("0.9.0"),
    },
    reason: REGISTRY_REFUSED,
  },
  {
    name: "a blocked unit states the condition that holds it",
    unit: {
      id: "reviewer",
      label: "@acme/subagents/reviewer",
      state: "blocked",
      disposition: "untouched",
      message: "Two settings ask for versions of this extension that cannot both hold.",
      blocking: {
        class: "precondition-unmet",
        subject: "@acme/subagents/reviewer",
        phase: "validation",
        detail: "Two settings ask for versions of this extension that cannot both hold.",
      },
      artifact: artifact("0.9.0"),
    },
    reason: "Two settings ask for versions of this extension that cannot both hold.",
  },
  {
    name: "a rolled-back unit states why its closure was undone",
    unit: {
      id: "reviewer",
      label: "@acme/subagents/reviewer",
      state: "rolled-back",
      disposition: "restored",
      message: "A later member of the same pack failed, so this one was undone.",
      artifact: artifact("0.9.0"),
    },
    reason: "A later member of the same pack failed, so this one was undone.",
  },
  {
    name: "a unit interrupted in flight states that it was",
    unit: {
      id: "reviewer",
      label: "@acme/subagents/reviewer",
      state: "interrupted",
      disposition: "restored",
      artifact: artifact("0.9.0"),
    },
    reason: "interrupted in flight",
  },
  {
    name: "a unit the operation stopped before states what stopped it",
    unit: {
      id: "reviewer",
      label: "@acme/subagents/reviewer",
      state: "planned",
      artifact: artifact("0.9.0"),
    },
    reason: "the operation stopped before this extension",
  },
  {
    name: "a unit blocked by the operation stopping states the condition it names",
    unit: {
      id: "reviewer",
      label: "@acme/subagents/reviewer",
      state: "blocked",
      message: "not attempted: the operation was interrupted",
      blocking: {
        class: "operation-aborted",
        subject: "@acme/subagents/reviewer",
        phase: "apply",
        detail: "not attempted: the operation was interrupted",
      },
      artifact: artifact("0.9.0"),
    },
    reason: "not attempted: the operation was interrupted",
  },
  {
    name: "a failed unit whose producer said nothing says that it said nothing",
    unit: {
      id: "reviewer",
      label: "@acme/subagents/reviewer",
      state: "failed",
      artifact: artifact("0.9.0"),
    },
    reason: "no reason was reported",
  },
];

describe("An unsettled unit states its reason", () => {
  it.each(cases)("$name", ({ unit, reason }) => {
    everywhere(resolutionOf([unit]), (painted, where) => {
      expect(painted, where).toContain(compact(reason));
    });
  });

  it("states every reason of a realistic partial operation at every width", () => {
    const reasons = partialUpdate.units.flatMap((unit) =>
      unit.state === "failed" && unit.message !== undefined ? [unit.message] : [],
    );
    expect(reasons.length).toBeGreaterThan(1);
    everywhere(partialUpdate, (painted, where) => {
      for (const reason of reasons)
        expect(painted, `${where}: ${reason}`).toContain(compact(reason));
    });
  });

  it("says the state unsettled units were left in once when they share one", () => {
    const resolution = resolutionOf([
      { ...cases[0]?.unit, id: "a", label: "a" } as ResolvedUnit<unknown>,
      { ...cases[0]?.unit, id: "b", label: "b" } as ResolvedUnit<unknown>,
    ]);
    everywhere(resolution, (painted, where) => {
      expect(painted, where).toContain(compact("Every extension that did not settle:"));
      expect(painted.split(compact("effects were restored")), where).toHaveLength(2);
    });
  });

  it("says it on each row when unsettled units were left in different states", () => {
    const resolution = resolutionOf([
      { ...cases[0]?.unit, id: "a", label: "a" } as ResolvedUnit<unknown>,
      {
        ...cases[0]?.unit,
        id: "b",
        label: "b",
        disposition: "retained",
      } as ResolvedUnit<unknown>,
    ]);
    everywhere(resolution, (painted, where) => {
      expect(painted, where).toContain(compact("effects were restored"));
      expect(painted, where).toContain(compact("partial work was retained"));
      expect(painted, where).not.toContain(compact("Every extension that did not settle:"));
    });
  });
});
