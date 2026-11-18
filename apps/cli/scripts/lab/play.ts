/**
 * Recorded operations replayed through the real `Screen`, so the live region,
 * its spinner, and the transcript it leaves can be watched at any speed
 * instead of judged from still frames.
 *
 * A recording is a lifecycle event log. Each operation in it gets its own
 * lifecycle service, the screen observes it as it would a running operation,
 * and every event is published after the gap the log records, divided by the
 * speed. A log recorded in process carries no gaps, so its events are spaced
 * evenly instead.
 */

import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  OperationEventSchema,
  makeOperationLifecycle,
  type OperationEvent,
} from "@agentxm/workspace-kernel/operations";

import { Screen } from "../../src/screen/screen.js";
import { liveUpdateRecording } from "../../src/test-support/gallery/samples/operation-stress.js";

/** The gap between events of a log that records none, at speed 1. */
const EVEN_GAP_MS = 400;

const decodeLog = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Array(OperationEventSchema)),
);

/** Every recording the lab can play, by name: the timed live update and each recorded log. */
export const recordings = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* path.fromFileUrl(
    new URL("../../src/test-support/conformance/recorded/", import.meta.url),
  );
  const files = (yield* fs.readDirectory(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const recorded = yield* Effect.forEach(files, (file) =>
    fs.readFileString(path.join(directory, file)).pipe(
      Effect.flatMap(decodeLog),
      Effect.map((events) => [path.basename(file, ".json"), events] as const),
    ),
  );
  return new Map<string, ReadonlyArray<OperationEvent>>([
    ["live-update", liveUpdateRecording],
    ...recorded,
  ]);
});

/** A log split into its operations, each from its start through its settlement. */
const operationsOf = (
  events: ReadonlyArray<OperationEvent>,
): ReadonlyArray<ReadonlyArray<OperationEvent>> => {
  const operations: Array<Array<OperationEvent>> = [];
  for (const event of events) {
    if (event._tag === "OperationStarted" || operations.length === 0) operations.push([]);
    operations.at(-1)?.push(event);
  }
  return operations;
};

const gapsOf = (events: ReadonlyArray<OperationEvent>): ReadonlyArray<number> => {
  const timed = events.some((event, index) => index > 0 && event.atMs !== events[index - 1]?.atMs);
  return events.map((event, index) =>
    index === 0
      ? 0
      : timed
        ? Math.max(0, event.atMs - (events[index - 1]?.atMs ?? event.atMs))
        : EVEN_GAP_MS,
  );
};

/** Replay one recording through the screen at `speed`. */
export const playRecording = (name: string, events: ReadonlyArray<OperationEvent>, speed: number) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    for (const operation of operationsOf(events)) {
      const started = operation.find((event) => event._tag === "OperationStarted");
      const lifecycle = yield* makeOperationLifecycle({
        name: started?._tag === "OperationStarted" ? started.name : name,
        mode: started?._tag === "OperationStarted" ? started.mode : "apply",
      });
      const gaps = gapsOf(operation);
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* screen.observe(lifecycle);
          for (const [index, event] of operation.entries()) {
            yield* Effect.sleep(Duration.millis((gaps[index] ?? 0) / speed));
            if (event._tag === "OperationSettled") yield* lifecycle.settle(event.outcome);
            else yield* lifecycle.publish((seq, atMs) => ({ ...event, seq, atMs }));
          }
          // A log cut before its operation settled still ends, so the region is released.
          yield* lifecycle.settle("completed");
          yield* lifecycle.drained.await;
        }),
      );
    }
    yield* screen.settle;
    yield* screen.note([
      { _tag: "paragraph", tone: "dim", text: `── ${name} replayed at ${String(speed)}×` },
    ]);
  });
