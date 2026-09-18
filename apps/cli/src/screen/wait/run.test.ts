import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Terminal from "effect/Terminal";

import type { Doc } from "../doc.js";
import { paintText } from "../paint-text.js";
import type { ScenePart } from "../scene.js";
import { runStaticWait, runWait, type WaitSurface } from "./run.js";
import type { WaitView } from "./wait.js";

const view: WaitView = {
  subject: "device-authorization",
  detail: "waiting on you",
  label: "Device sign-in",
  status: "Waiting for approval on registry.agentxm.ai",
  brief: [
    {
      _tag: "paragraph",
      text: [{ text: "Open: " }, { text: "https://auth.test", copyable: true }],
    },
  ],
  expiresAtMs: 600_000,
};

const press = (name: string, options?: { readonly ctrl?: boolean }): Terminal.UserInput => ({
  input: name.length === 1 && options?.ctrl !== true ? Option.some(name) : Option.none(),
  key: { name, ctrl: options?.ctrl === true, meta: false, shift: false },
});

interface Harness {
  readonly terminal: Terminal.Terminal;
  readonly surface: WaitSurface;
  readonly keys: Queue.Queue<Terminal.UserInput, Cause.Done>;
  /** The interaction the scene stands on after each change; `undefined` cleared it. */
  readonly shown: Array<ScenePart | undefined>;
  readonly transcript: Array<Doc>;
}

const makeHarness: Effect.Effect<Harness> = Effect.gen(function* () {
  const keys = yield* Queue.make<Terminal.UserInput, Cause.Done>();
  const shown: Array<ScenePart | undefined> = [];
  const transcript: Array<Doc> = [];
  return {
    keys,
    shown,
    transcript,
    terminal: Terminal.make({
      columns: Effect.succeed(80),
      rows: Effect.succeed(24),
      readInput: Effect.succeed(Queue.asDequeue(keys)),
      readLine: Effect.succeed(""),
      display: () => Effect.void,
    }),
    surface: {
      showInteraction: (part) => Effect.sync(() => void shown.push(part)),
      transcript: (doc) => Effect.sync(() => void transcript.push(doc)),
    },
  };
});

/** The lines the live region last stood on before it was cleared. */
const lastFrame = (harness: Harness): string => {
  const part = harness.shown.filter((entry) => entry !== undefined).at(-1);
  return part === undefined
    ? ""
    : paintText(part({ columns: 80, rows: 24, spinner: "◒", nowMs: 0 }), {
        width: 80,
        colors: false,
        spinner: "◒",
      }).join("\n");
};

describe("runWait", () => {
  it.effect("answers with what the awaited effect settled on, and settles into one line", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;

      const settled = yield* runWait(
        view,
        Effect.succeed("approved"),
        {},
        harness.terminal,
        harness.surface,
      );

      expect(settled).toBe("approved");
      // The brief first, once, then the settled record the wait leaves behind.
      expect(harness.transcript[0]).toEqual(view.brief);
      expect(harness.transcript.at(-1)).toMatchObject([
        { _tag: "answer", mark: "ok", label: "Device sign-in" },
      ]);
      expect(harness.shown.at(-1)).toBeUndefined();
    }),
  );

  it.effect("keeps only the countdown live, never the value the brief printed", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      const release = yield* Deferred.make<void>();

      const running = yield* Effect.forkChild(
        runWait(view, Deferred.await(release), {}, harness.terminal, harness.surface),
      );
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;

      const frame = lastFrame(harness);
      expect(frame).toContain("Waiting for approval on registry.agentxm.ai");
      expect(frame).not.toContain("https://auth.test");

      yield* Deferred.succeed(release, undefined);
      yield* Fiber.await(running);
    }),
  );

  it.effect("fails with WaitAbandoned when the wait is stopped", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.keys, press("escape"));

      const failure = yield* runWait(
        view,
        Effect.never,
        {},
        harness.terminal,
        harness.surface,
      ).pipe(Effect.flip);

      expect(failure._tag).toBe("WaitAbandoned");
      // A stopped wait settled nothing, so it leaves no record behind.
      expect(harness.transcript).toEqual([view.brief]);
      expect(harness.shown.at(-1)).toBeUndefined();
    }),
  );

  it.effect("stops on an interrupt key, which raw mode delivers as a byte", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.offer(harness.keys, press("c", { ctrl: true }));

      const failure = yield* runWait(
        view,
        Effect.never,
        {},
        harness.terminal,
        harness.surface,
      ).pipe(Effect.flip);

      expect(failure._tag).toBe("WaitAbandoned");
    }),
  );

  it.effect("reopens and copies without ending the wait", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      const opened: Array<string> = [];
      const release = yield* Deferred.make<void>();
      yield* Queue.offer(harness.keys, press("o"));
      yield* Queue.offer(harness.keys, press("c"));

      const settled = yield* runWait(
        view,
        Deferred.await(release).pipe(Effect.as("approved")),
        {
          open: Effect.sync(() => void opened.push("open")),
          copy: Effect.sync(() => void opened.push("copy")),
        },
        harness.terminal,
        harness.surface,
      ).pipe(
        Effect.raceFirst(
          // The keys are acted on first; the wait ends only when the awaited
          // effect does, which this releases once they have been.
          Effect.suspend(() =>
            opened.length === 2 ? Deferred.succeed(release, undefined) : Effect.yieldNow,
          ).pipe(Effect.forever),
        ),
      );

      expect(settled).toBe("approved");
      expect(opened).toEqual(["open", "copy"]);
    }),
  );

  it.effect("goes on waiting when the terminal stops sending keys", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;
      yield* Queue.end(harness.keys);

      const settled = yield* runWait(
        view,
        Effect.succeed("approved"),
        {},
        harness.terminal,
        harness.surface,
      );

      expect(settled).toBe("approved");
    }),
  );

  it.effect("clears the wait when the command around it is interrupted", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;

      const running = yield* Effect.forkChild(
        runWait(view, Effect.never, {}, harness.terminal, harness.surface),
      );
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(running);

      expect(harness.shown.length).toBeGreaterThanOrEqual(2);
      expect(harness.shown.at(-1)).toBeUndefined();
    }),
  );
});

describe("runStaticWait", () => {
  it.effect("prints the brief once, with no countdown and no keys, and simply waits", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness;

      const settled = yield* runStaticWait(view, Effect.succeed("approved"), harness.surface);

      expect(settled).toBe("approved");
      expect(harness.shown).toEqual([]);
      expect(harness.transcript[0]).toEqual(view.brief);
      expect(harness.transcript.at(-1)).toMatchObject([
        { _tag: "answer", mark: "ok", label: "Device sign-in" },
      ]);
    }),
  );
});
