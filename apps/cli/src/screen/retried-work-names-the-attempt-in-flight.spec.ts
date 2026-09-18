import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import { OperationEventSchema, type OperationEvent } from "@agentxm/workspace/transitions/planning";

import { defineSpecification } from "@agentxm/specification-metadata";

import { plain } from "./doc.js";
import { joinLiveRows, type LivePlan } from "./live-ledger.js";
import { ProgressEventSchema, progressEvent } from "./machine-events.js";
import { initialProgress, reduceProgress, type ProgressState } from "./progress.js";

export const specification = defineSpecification({
  requirement: "cli/retried-work-names-the-attempt-in-flight",
  title: "A retried unit reports which attempt is in flight, to machines and to people alike",
  statement:
    "When a producer retries a unit's work, the unit's progress events shall carry the attempt in flight and the attempt limit, a machine progress event shall carry both unchanged through the published lifecycle schema, and the live row for that unit shall name the retry it is on in place of its measurement; a unit on its first attempt shall name no retry.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "The attempt is stated by the producer on the published event; which work retries, and how often, belongs to each producer's request policy and is not decided here.",
  methods: ["contract", "example"],
  derivedFrom: [
    "cli/machine-progress-events-follow-the-lifecycle-schema",
    "packages/supporting/registry-client/src/request-policy.test.ts",
    "packages/supporting/registry-client/src/remote-client.test.ts",
    "packages/core/workspace/src/transitions/planning/plan/operation-events.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "Examples drive the published schema, the projector, and the live join over an authored event log. A registry download that a transport failure actually retries is witnessed by ordinary tests in the registry client, not decided here.",
      retirementCondition:
        "Bind producer evidence here when a retrying producer's own attempt reporting is allocated its own obligation.",
    },
  ],
});

const decodeProgressEvent = Schema.decodeUnknownSync(ProgressEventSchema);
const encodeOperationEvent = Schema.encodeSync(OperationEventSchema);
const decodeOperationEvent = Schema.decodeUnknownSync(OperationEventSchema);

/** One extension downloading, so a row exists for a retry to be reported on. */
const downloading: ReadonlyArray<OperationEvent> = [
  {
    _tag: "OperationStarted",
    seq: 1,
    atMs: 1_000,
    operationId: "operation-1",
    name: "Install skill",
    mode: "apply",
  },
  { _tag: "PhaseStarted", seq: 2, atMs: 1_001, phase: "apply" },
  {
    _tag: "UnitStarted",
    seq: 3,
    atMs: 1_002,
    unitId: "skill:code-review",
    label: "code-review",
    index: 0,
    total: 1,
  },
];

const progressOn = (
  seq: number,
  done: number,
  attempt?: { readonly n: number; readonly of: number },
): OperationEvent => ({
  _tag: "UnitProgress",
  seq,
  atMs: 1_000 + seq,
  unitId: "skill:code-review",
  done,
  total: 2_000_000,
  unit: "bytes",
  ...(attempt === undefined ? {} : { attempt }),
});

const fold = (events: ReadonlyArray<OperationEvent>): ProgressState =>
  events.reduce(reduceProgress, initialProgress);

const plan: LivePlan = {
  title: "Installing",
  columns: [{ header: "Extension", role: "name" }],
  rows: [{ id: "skill:code-review", mark: "create", cells: ["code-review"] }],
};

/** The detail cell, which is the last column the live ledger appends. */
const detail = (state: ProgressState): string => {
  const [row] = joinLiveRows(state, plan);
  expect(row).toBeDefined();
  const cells = row?.row.cells ?? [];
  return plain(cells[cells.length - 1] ?? "");
};

describe("A retried unit names the attempt in flight", () => {
  it("carries the attempt and the attempt limit through the published schema", () => {
    const event = progressOn(4, 0, { n: 2, of: 3 });
    const encoded = encodeOperationEvent(event);
    expect(decodeOperationEvent(encoded)).toEqual(event);

    const machine = decodeProgressEvent(JSON.parse(JSON.stringify(progressEvent(event))));
    expect(machine.event).toEqual(event);
  });

  it("names the retry on the live row in place of the measurement", () => {
    expect(detail(fold([...downloading, progressOn(4, 0, { n: 2, of: 3 })]))).toBe("retry 2 of 3");
  });

  it("names no retry while the first attempt runs", () => {
    expect(detail(fold([...downloading, progressOn(4, 512_000, { n: 1, of: 3 })]))).toBe(
      "512 KB / 2 MB",
    );
    expect(detail(fold([...downloading, progressOn(4, 512_000)]))).toBe("512 KB / 2 MB");
  });

  it("stops naming a retry once a later attempt reports without one", () => {
    const state = fold([
      ...downloading,
      progressOn(4, 0, { n: 2, of: 3 }),
      progressOn(5, 1_000_000),
    ]);
    expect(detail(state)).toBe("1 MB / 2 MB");
  });
});
