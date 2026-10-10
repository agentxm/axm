import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  OperationEventSchema,
  OperationModeSchema,
  OperationPhaseSchema,
  SettledOutcomeSchema,
} from "@agentxm/workspace-kernel/operations";
import { PlanResolutionDocumentSchema } from "../operation-output.js";
import { ProgressEventSchema } from "./index.js";
import { MachineEventSchema } from "../runtime.js";
import { HELP_TOPICS } from "../__generated__/help-topics.js";
import { handleList as handleRootList } from "../root/list/command.js";
import { handleList as handleSkillsList } from "../root/skills/list.js";
import { handleInstall } from "../root/install/handler.js";
import { handleUpdate } from "../root/update/handler.js";
import { handleSync } from "../root/sync/handler.js";

import { defineSpecification } from "@agentxm/specification-metadata";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../test-support/install-harness.js";
import type { RecordedWrite } from "../test-support/screen-harness.js";

export const specification = defineSpecification({
  requirement: "cli/machine-progress-events-follow-the-lifecycle-schema",
  title: "Machine progress events are the published lifecycle events, in order, before the result",
  statement:
    "When machine output mode is on and progress is enabled, every progress event written to standard error shall decode as one lifecycle event of the published schema whose sequence number strictly increases within its operation, the operation shall write exactly one settled event before its result document, read-only operations shall start in query mode and settle as completed, stderr shall use only the five published event types, served help shall list exactly the schema modes, phases, and settled outcomes in schema order, and a resolved unit that did not settle as planned shall carry the category and detail its producer settled with through that schema while a unit that settled as planned carries none.",
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

  const machineInstall = () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        screen: { kind: "machine" },
        flags: { json: true },
      });
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        type: Option.none(),
        source: Option.some(skillPackage),
        selectors: {},
        all: true,
        preview: false,
        bind: [],
        bindEnv: [],
        localName: Option.none(),
        bundled: false,
      }).pipe(Effect.provide(workspace.layer));
      const log = workspace.streams?.log ?? [];
      return { log, progress: progressLines(log) };
    });

  const machineConfiguredUpdate = (preview: boolean) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        screen: { kind: "machine" },
        flags: { json: true },
      });
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        type: Option.none(),
        source: Option.some(skillPackage),
        selectors: {},
        all: true,
        preview: false,
        bind: [],
        bindEnv: [],
        localName: Option.none(),
        bundled: false,
      }).pipe(Effect.provide(workspace.layer));
      const log = workspace.streams?.log ?? [];
      log.splice(0);
      yield* handleUpdate({ source: Option.none(), reinstall: false, preview }).pipe(
        Effect.provide(workspace.layer),
      );
      return { log, progress: progressLines(log) };
    });

  const machineSync = (preview: boolean) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        screen: { kind: "machine" },
        flags: { json: true },
      });
      cleanups.push(workspace.cleanup);
      yield* handleSync({ preview }).pipe(Effect.provide(workspace.layer));
      const log = workspace.streams?.log ?? [];
      return { log, progress: progressLines(log) };
    });

  it("publishes exactly the lifecycle enum values in schema order", () => {
    const help = HELP_TOPICS["machine-output"];
    for (const row of [
      { field: "OperationStarted.mode", values: OperationModeSchema.literals },
      { field: "PhaseStarted.phase", values: OperationPhaseSchema.literals },
      { field: "OperationSettled.outcome", values: SettledOutcomeSchema.literals },
    ]) {
      const line = help
        .split("\n")
        .find((entry) => entry.split("|")[1]?.trim() === `\`${row.field}\``);
      expect(line).toBeDefined();
      const cells = line?.split("|");
      const values = [...(cells?.[2] ?? "").matchAll(/`([^`]+)`/gu)].map((match) => match[1]);
      expect(values).toEqual(row.values);
    }
  });

  it.effect(
    "the public stderr schema accepts all five event types and refuses an unknown type",
    () =>
      Effect.gen(function* () {
        const decode = Schema.decodeUnknownEffect(MachineEventSchema);
        for (const event of [
          {
            type: "progress",
            event: {
              _tag: "OperationStarted",
              operationId: "query",
              name: "List",
              mode: "query",
              seq: 1,
              atMs: 1_000,
            },
          },
          { type: "log", level: "info", message: "Information" },
          { type: "error", code: "network", message: "Connection refused" },
          { type: "suggestion", description: "Try again", cmd: "axm list" },
          { type: "instruction", message: "Complete sign-in" },
        ]) {
          expect(yield* decode(event)).toEqual(event);
        }
        expect(
          yield* Effect.result(decode({ type: "unknown", message: "Unsupported" })),
        ).toHaveProperty("_tag", "Failure");
      }),
  );

  for (const route of ["root list", "typed list"] as const) {
    it.effect(`${route} starts in query mode and completes once before its result`, () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({ screen: { kind: "machine" }, flags: { json: true } });
        cleanups.push(workspace.cleanup);
        if (route === "root list") {
          yield* handleRootList({ types: [], outdated: false, deprecated: false }).pipe(
            Effect.provide(workspace.layer),
          );
        } else {
          yield* handleSkillsList().pipe(Effect.provide(workspace.layer));
        }
        const log = workspace.streams?.log ?? [];
        const progress = progressLines(log);
        const events = yield* Effect.forEach(progress, (line) => decodeProgressEvent(line.value));
        expect(events.filter((entry) => entry.event._tag === "OperationStarted")).toMatchObject([
          { event: { mode: "query" } },
        ]);
        expect(events.filter((entry) => entry.event._tag === "OperationSettled")).toMatchObject([
          { event: { outcome: "completed" } },
        ]);
        const resultIndex = log.findIndex((entry) => entry.channel === "stdout");
        expect(resultIndex).toBeGreaterThan(-1);
        expect(progress.every((line) => line.index < resultIndex)).toBe(true);
        expect(log.filter((entry) => entry.channel === "stdout")).toHaveLength(1);
      }),
    );
  }

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

  it.effect(
    "carries a resolved unit's failure through the schema, and only when there is one",
    () =>
      Effect.gen(function* () {
        const failed = yield* decodeOperationEvent({
          _tag: "UnitResolved",
          seq: 9,
          atMs: 1_000,
          unitId: "skill:code-review",
          label: "code-review",
          state: "failed",
          index: 0,
          total: 1,
          failure: { category: "network", detail: "The registry refused the request." },
        });
        const again = yield* decodeOperationEvent(yield* encodeOperationEvent(failed));
        expect(again).toEqual(failed);
        expect(failed._tag === "UnitResolved" && failed.failure).toEqual({
          category: "network",
          detail: "The registry refused the request.",
        });

        // Every unit an install settles, settles as planned, so none states one.
        const { progress } = yield* machineInstall();
        for (const line of progress) {
          const decoded = yield* decodeProgressEvent(line.value);
          if (decoded.event._tag !== "UnitResolved") continue;
          expect(decoded.event.state).not.toBe("failed");
          expect(decoded.event.failure).toBeUndefined();
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

  it.effect(
    "configured update preview and apply each have one ordered lifecycle and one result",
    () =>
      Effect.forEach(
        [true, false],
        (preview) =>
          Effect.gen(function* () {
            const { log, progress } = yield* machineConfiguredUpdate(preview);
            const events = yield* Effect.forEach(progress, (line) =>
              Effect.map(decodeProgressEvent(line.value), (decoded) => ({
                index: line.index,
                event: decoded.event,
              })),
            );
            expect(events.filter((entry) => entry.event._tag === "OperationStarted")).toHaveLength(
              1,
            );
            expect(events.filter((entry) => entry.event._tag === "OperationSettled")).toHaveLength(
              1,
            );
            expect(
              events.find((entry) => entry.event._tag === "PhaseStarted")?.event,
            ).toMatchObject({
              phase: "resolution",
            });
            expect(
              events
                .filter((entry) => entry.event._tag === "UnitStarted")
                .map((entry) => entry.event),
            ).toEqual(
              expect.arrayContaining([
                expect.objectContaining({ unitId: "configured-update:skill" }),
              ]),
            );
            for (let index = 1; index < events.length; index += 1) {
              const previous = events[index - 1];
              const current = events[index];
              expect(current?.event.seq).toBeGreaterThan(previous?.event.seq ?? 0);
            }
            const resultWrites = log.filter((entry) => entry.channel === "stdout");
            expect(resultWrites).toHaveLength(1);
            const resultIndex = log.findIndex((entry) => entry.channel === "stdout");
            yield* decodeDocument(JSON.parse(resultWrites[0]?.content ?? ""));
            expect(events.every((entry) => entry.index < resultIndex)).toBe(true);
          }),
        { discard: true },
      ),
  );

  it.effect("sync preview and apply each settle once before one result document", () =>
    Effect.forEach(
      [true, false],
      (preview) =>
        Effect.gen(function* () {
          const { log, progress } = yield* machineSync(preview);
          const events = yield* Effect.forEach(progress, (line) =>
            Effect.map(decodeProgressEvent(line.value), (decoded) => ({
              index: line.index,
              event: decoded.event,
            })),
          );
          expect(events.filter((entry) => entry.event._tag === "OperationStarted")).toHaveLength(1);
          expect(events.filter((entry) => entry.event._tag === "OperationSettled")).toHaveLength(1);
          const resultWrites = log.filter((entry) => entry.channel === "stdout");
          expect(resultWrites).toHaveLength(1);
          const resultIndex = log.findIndex((entry) => entry.channel === "stdout");
          yield* decodeDocument(JSON.parse(resultWrites[0]?.content ?? ""));
          expect(events.every((entry) => entry.index < resultIndex)).toBe(true);
        }),
      { discard: true },
    ),
  );
});
