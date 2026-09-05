import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  OperationEventSchema,
  PlanResolutionDocumentSchema,
  ProgressEventSchema,
  handleInstall,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";
import type { RecordedWrite } from "../support/screen-harness.js";

export const specification = defineSpecification({
  requirement: "cli/machine-progress-events-follow-the-lifecycle-schema",
  title: "Machine progress events are the published lifecycle events, in order, before the result",
  statement:
    "When machine output mode is on, every progress event written to standard error shall decode as one lifecycle event of the published schema whose sequence number strictly increases within its operation, and the operation shall write exactly one settled event before its result document.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["contract", "example"],
  derivedFrom: ["cli/machine-errors-use-the-stable-envelope"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodeProgressEvent = Schema.decodeUnknownEffect(ProgressEventSchema);
const decodeOperationEvent = Schema.decodeUnknownEffect(OperationEventSchema);
const encodeOperationEvent = Schema.encodeEffect(OperationEventSchema);
const decodeDocument = Schema.decodeUnknownEffect(PlanResolutionDocumentSchema);

/** Every stderr line that is a JSON object with `type: "progress"`, with the log index it came from. */
const progressLines = (
  log: ReadonlyArray<RecordedWrite>,
): ReadonlyArray<{ readonly index: number; readonly value: unknown }> =>
  log.flatMap((entry, index) => {
    if (entry.channel !== "stderr") return [];
    return entry.content
      .split("\n")
      .filter((line) => line.length > 0)
      .flatMap((line) => {
        const value: unknown = JSON.parse(line);
        return typeof value === "object" &&
          value !== null &&
          "type" in value &&
          value.type === "progress"
          ? [{ index, value }]
          : [];
      });
  });

describe("Machine progress event contract", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const machineInstall = (options?: { readonly quiet?: boolean }) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        screen: { kind: "machine" },
        flags: { json: true, ...(options?.quiet === true ? { quiet: true } : {}) },
      });
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        source: Option.some(skillPackage),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      const log = workspace.streams?.log ?? [];
      return { log, progress: progressLines(log) };
    });

  it.effect(
    "every progress line decodes through the published schema with a strictly increasing sequence",
    () =>
      Effect.gen(function* () {
        const { progress } = yield* machineInstall();
        expect(progress.length).toBeGreaterThan(0);

        const events = yield* Effect.forEach(progress, (line) =>
          Effect.map(decodeProgressEvent(line.value), (decoded) => decoded.event),
        );

        const started = events.filter((event) => event._tag === "OperationStarted");
        expect(started).toHaveLength(1);
        for (let index = 1; index < events.length; index += 1) {
          const previous = events[index - 1];
          const current = events[index];
          expect(previous).toBeDefined();
          expect(current).toBeDefined();
          if (previous !== undefined && current !== undefined) {
            expect(current.seq).toBeGreaterThan(previous.seq);
          }
        }
      }),
  );

  it.effect("every event round-trips through the published lifecycle schema", () =>
    Effect.gen(function* () {
      const { progress } = yield* machineInstall();
      for (const line of progress) {
        const decoded = yield* decodeProgressEvent(line.value);
        const encoded = yield* encodeOperationEvent(decoded.event);
        const again = yield* decodeOperationEvent(encoded);
        expect(again).toEqual(decoded.event);
      }
    }),
  );

  it.effect("exactly one settled event precedes the result document", () =>
    Effect.gen(function* () {
      const { log, progress } = yield* machineInstall();
      const events = yield* Effect.forEach(progress, (line) =>
        Effect.map(decodeProgressEvent(line.value), (decoded) => ({
          index: line.index,
          event: decoded.event,
        })),
      );

      const settled = events.filter((entry) => entry.event._tag === "OperationSettled");
      expect(settled).toHaveLength(1);

      const resultIndex = log.findIndex((entry) => entry.channel === "stdout");
      expect(resultIndex).toBeGreaterThan(-1);
      const document = yield* decodeDocument(JSON.parse(log[resultIndex]?.content ?? ""));
      expect(document.result.outcome).toBe("applied");

      const [terminal] = settled;
      expect(terminal).toBeDefined();
      expect(terminal?.index).toBeLessThan(resultIndex);
      expect(events.every((entry) => entry.index < resultIndex)).toBe(true);
    }),
  );

  it.effect("quiet suppresses progress events while the result document still appears", () =>
    Effect.gen(function* () {
      const { log, progress } = yield* machineInstall({ quiet: true });
      expect(progress).toEqual([]);
      const resultIndex = log.findIndex((entry) => entry.channel === "stdout");
      expect(resultIndex).toBeGreaterThan(-1);
      const document = yield* decodeDocument(JSON.parse(log[resultIndex]?.content ?? ""));
      expect(document.result.outcome).toBe("applied");
    }),
  );
});
