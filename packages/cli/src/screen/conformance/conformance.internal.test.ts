/**
 * Renderer conformance: the production painter and the alternative painter
 * run through the same suite over the gallery fixtures and the recorded
 * event logs, so a renderer swap behind the `Doc` and event seams is a
 * checked claim rather than an assumption.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import {
  makeOperationLifecycle,
  OperationEventSchema,
  type OperationEvent,
  type OperationLifecycleService,
} from "@agentxm/workspace-operations";

import type { Doc } from "../doc.js";
import { FrameLive } from "../frame.js";
import { gallery } from "../gallery/index.js";
import { paintText } from "../paint-text.js";
import { initialProgress, reduceProgress, type ProgressState } from "../progress.js";
import { liveProgressLines } from "../progress-view.js";
import { Screen, ScreenLive } from "../screen.js";
import { OutputStreams } from "../streams.js";
import { displayWidth } from "../width.js";
import { paintBoxed } from "./alternative-painter.js";
import {
  asciiViolations,
  colorViolations,
  conformanceWidths,
  determinismViolations,
  nodeKinds,
  nodeKindsOf,
  trailingWhitespaceViolations,
  unboundedViolations,
  widthViolations,
  type Painter,
} from "./conformance-suite.js";

const painters: ReadonlyArray<Painter> = [
  { name: "paintText", paint: paintText },
  { name: "paintBoxed (alternative)", paint: paintBoxed },
];

const recordedDir = fileURLToPath(new URL("./recorded/", import.meta.url));
const decodeLog = Schema.decodeUnknownSync(Schema.Array(OperationEventSchema));
const recordedLogs: ReadonlyArray<{
  readonly name: string;
  readonly events: ReadonlyArray<OperationEvent>;
}> = fs
  .readdirSync(recordedDir)
  .filter((entry) => entry.endsWith(".json"))
  .sort()
  .map((entry) => ({
    name: entry.replace(/\.json$/u, ""),
    events: decodeLog(JSON.parse(fs.readFileSync(path.join(recordedDir, entry), "utf8"))),
  }));

const fold = (events: ReadonlyArray<OperationEvent>): ProgressState =>
  events.reduce(reduceProgress, initialProgress);

const CURSOR_SHOW = "\u001b[?25h";

/** Output streams that keep one ordered log across both channels. */
const makeOrderedStreams = () => {
  const log: Array<{ readonly channel: "stdout" | "stderr"; readonly content: string }> = [];
  const layer = Layer.succeed(OutputStreams, {
    stdout: (content) => Effect.sync(() => void log.push({ channel: "stdout", content })),
    stderr: (content) => Effect.sync(() => void log.push({ channel: "stderr", content })),
    facts: Effect.succeed({ stdoutIsTTY: true, stderrIsTTY: true, columns: 80 }),
    resize: Stream.empty,
  });
  return { log, layer };
};

/** Replay a recorded log through a lifecycle service so observers see it live. */
const replay = (
  lifecycle: OperationLifecycleService,
  events: ReadonlyArray<OperationEvent>,
  between?: (event: OperationEvent) => Effect.Effect<void>,
): Effect.Effect<void> =>
  Effect.forEach(
    events,
    (event) =>
      (event._tag === "OperationSettled"
        ? lifecycle.settle(event.outcome)
        : lifecycle.publish((seq, atMs) => ({ ...event, seq, atMs }))
      ).pipe(Effect.andThen(between === undefined ? Effect.void : between(event))),
    { discard: true },
  );

describe("renderer conformance", () => {
  it("the every-node fixture covers every node kind", () => {
    const covered = nodeKindsOf(
      gallery.find((fixture) => fixture.name === "every-node")?.doc ?? [],
    );
    expect([...covered].sort()).toEqual([...nodeKinds].sort());
  });

  it("recorded logs exist for apply, preview, and failure", () => {
    expect(recordedLogs.map((log) => log.name)).toEqual([
      "install-apply",
      "install-failed",
      "install-preview",
    ]);
  });

  describe.each(painters)("$name", (painter) => {
    const fixtures = gallery.map((fixture) => ({ name: fixture.name, doc: fixture.doc }));

    it.each(fixtures)("keeps every painted line of $name within the width", ({ doc, name }) => {
      for (const width of conformanceWidths) {
        expect(widthViolations(painter, doc, width), `${name}@${String(width)}`).toEqual([]);
        expect(
          trailingWhitespaceViolations(painter, doc, width),
          `${name}@${String(width)}`,
        ).toEqual([]);
      }
    });

    it.each(fixtures)("never wraps, truncates, or pads $name when unbounded", ({ doc, name }) => {
      expect(unboundedViolations(painter, doc), name).toEqual([]);
      expect(trailingWhitespaceViolations(painter, doc, "unbounded"), name).toEqual([]);
    });

    it.each(fixtures)("paints $name identically with color on and off", ({ doc, name }) => {
      for (const width of conformanceWidths) {
        expect(colorViolations(painter, doc, width), `${name}@${String(width)}`).toEqual([]);
      }
    });

    it.each(fixtures)(
      "adds no symbols of its own to $name under the ASCII glyphs",
      ({ doc, name }) => {
        expect(asciiViolations(painter, doc), name).toEqual([]);
      },
    );

    it.each(fixtures)("paints $name deterministically", ({ doc, name }) => {
      for (const width of conformanceWidths) {
        expect(determinismViolations(painter, doc, { width, colors: true }), name).toEqual([]);
      }
      expect(
        determinismViolations(painter, doc, { width: "unbounded", colors: false }),
        name,
      ).toEqual([]);
    });

    it("paints an empty document as no lines", () => {
      const empty: Doc = [];
      expect(painter.paint(empty, { width: 80, colors: false })).toEqual([]);
    });
  });

  describe.each(recordedLogs)("recorded log $name", ({ events }) => {
    it("folds deterministically into the same progress state at every width", () => {
      const reference = fold(events);
      for (const width of conformanceWidths) {
        expect(fold(events)).toEqual(reference);
        for (let count = 1; count <= events.length; count += 1) {
          const lines = liveProgressLines(fold(events.slice(0, count)), {
            width,
            colors: false,
            spinner: "◐",
            nowMs: 5_000,
          });
          for (const line of lines) {
            expect(displayWidth(line), `${String(width)}: ${line}`).toBeLessThanOrEqual(width);
          }
        }
      }
      expect(reference.settled).toBeDefined();
      expect(reference.lastSeq).toBe(events.at(-1)?.seq);
    });

    it("carries strictly increasing sequence numbers ending in one settlement", () => {
      const settled = events.filter((event) => event._tag === "OperationSettled");
      expect(settled.length).toBeGreaterThanOrEqual(1);
      expect(events.at(-1)?._tag).toBe("OperationSettled");
      let previous = 0;
      let operations = 0;
      for (const event of events) {
        if (event._tag === "OperationStarted") {
          operations += 1;
          previous = 0;
        }
        expect(event.seq).toBeGreaterThan(previous);
        previous = event.seq;
      }
      expect(settled).toHaveLength(operations);
    });

    it.effect(
      "interleaves a transcript note above the live region and collapses before the settled document",
      () => {
        const streams = makeOrderedStreams();
        const layer = Layer.provide(
          ScreenLive({ colors: { stdout: false, stderr: false }, animate: true }),
          Layer.merge(
            Layer.provide(FrameLive({ animate: true, quiet: false, colors: false }), streams.layer),
            streams.layer,
          ),
        );
        const firstOperation = events.slice(
          0,
          events.findIndex((event) => event._tag === "OperationSettled") + 1,
        );
        const midpoint = Math.floor(firstOperation.length / 2);
        return Effect.gen(function* () {
          const screen = yield* Screen;
          const lifecycle = yield* makeOperationLifecycle({ name: "replay", mode: "apply" });
          yield* screen.observe(lifecycle);
          yield* replay(lifecycle, firstOperation, (event) =>
            event.seq === firstOperation[midpoint]?.seq
              ? screen.note([{ _tag: "paragraph", text: "note during operation" }])
              : Effect.void,
          );
          yield* lifecycle.drained.await;
          yield* screen.result([{ _tag: "headline", tone: "ok", text: "settled document" }]);

          const stderr = streams.log
            .filter((entry) => entry.channel === "stderr")
            .map((entry) => entry.content)
            .join("");
          expect(stderr).toContain("note during operation\n");
          const collapse = streams.log.findIndex(
            (entry) =>
              entry.channel === "stderr" &&
              /(?:✔|✖|▲) /u.test(entry.content) &&
              entry.content.endsWith("\n") &&
              !entry.content.includes("note during"),
          );
          const settledDocument = streams.log.findIndex((entry) => entry.channel === "stdout");
          expect(collapse).toBeGreaterThanOrEqual(0);
          expect(settledDocument).toBeGreaterThan(collapse);
          const noteIndex = streams.log.findIndex((entry) => entry.content.includes("note during"));
          const repaintAfterNote = streams.log
            .slice(noteIndex + 1)
            .some((entry) => entry.channel === "stderr" && entry.content.includes("\u001b[?25l"));
          expect(repaintAfterNote).toBe(true);
        }).pipe(Effect.provide(layer), Effect.scoped);
      },
    );

    it.effect("restores the cursor and keeps the transcript when interrupted mid-log", () => {
      const streams = makeOrderedStreams();
      const layer = Layer.provide(
        ScreenLive({ colors: { stdout: false, stderr: false }, animate: true }),
        Layer.merge(
          Layer.provide(FrameLive({ animate: true, quiet: false, colors: false }), streams.layer),
          streams.layer,
        ),
      );
      const partial = events.slice(0, Math.max(2, Math.floor(events.length / 2)));
      return Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const fiber = yield* Effect.gen(function* () {
          const screen = yield* Screen;
          const lifecycle = yield* makeOperationLifecycle({ name: "replay", mode: "apply" });
          yield* screen.observe(lifecycle);
          yield* replay(lifecycle, partial);
          yield* screen.note([{ _tag: "paragraph", text: "transcript stayed whole" }]);
          yield* Deferred.succeed(started, undefined);
          return yield* Effect.never;
        }).pipe(Effect.provide(layer), Effect.scoped, Effect.forkChild);
        yield* Deferred.await(started);
        yield* Fiber.interrupt(fiber);
        const stderr = streams.log.map((entry) => entry.content).join("");
        expect(stderr).toContain("transcript stayed whole\n");
        expect(stderr).toContain(CURSOR_SHOW);
      });
    });
  });
});
