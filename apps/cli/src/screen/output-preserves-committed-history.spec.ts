import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { defineSpecification } from "@agentxm/specification-metadata";
import {
  makeOperationLifecycle,
  type OperationEvent,
} from "@agentxm/workspace/transitions/planning";
import { FrameLive } from "./frame.js";
import { Screen, ScreenLive } from "./screen.js";
import { makeTestOutputStreams } from "./streams.js";
import { progressTransitionDoc } from "./progress-view.js";
import { initialProgress, reduceProgress } from "./progress.js";
import { paintText } from "./paint-text.js";
import {
  makeTerminalReplay,
  replayBytes,
  terminalTranscript,
} from "../test-support/terminal-replay.js";

export const specification = defineSpecification({
  requirement: "cli/output-preserves-committed-history",
  title: "CLI output preserves the story already told",
  statement:
    "AXM human output shall preserve committed context, phase dispositions, decisions and exceptions in emission order through later activity, interaction, resize and settlement; animation shall replace only current activity or controls, and a unit that fails shall append its available reason when that failure is observed rather than folding it out of history.",
  class: "human-factors",
  role: "experience",
  goals: ["actionable-diagnostics", "extension-adoption"],
  methods: ["example"],
  derivedFrom: ["cli/unsettled-units-state-their-reason"],
  supersedes: ["cli/live-progress-retains-settled-units"],
  assumptions: ["The terminal retains enough scrollback for the invocation."],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "Headless terminal replay interprets emitted control bytes but cannot establish every terminal's resize/reflow behavior.",
      retirementCondition:
        "Representative real-terminal and PTY resize observations supplement emulator evidence.",
    },
  ],
});

const failure: OperationEvent = {
  _tag: "UnitResolved",
  seq: 3,
  atMs: 3,
  unitId: "failed-unit",
  label: "@acme/skills/review",
  index: 0,
  total: 12,
  state: "failed",
  failure: { category: "network", detail: "The registry refused the request." },
};

const history: ReadonlyArray<OperationEvent> = [
  {
    _tag: "OperationStarted",
    seq: 1,
    atMs: 1,
    operationId: "test",
    name: "Updating extensions",
    mode: "apply",
  },
  { _tag: "PhaseStarted", seq: 2, atMs: 2, phase: "apply" },
  failure,
  ...Array.from({ length: 20 }, (_, index): OperationEvent => ({
    _tag: "UnitResolved",
    seq: 4 + index,
    atMs: 4 + index,
    unitId: `unit-${String(index)}`,
    label: `unit ${String(index)}`,
    index: index + 1,
    state: "committed",
  })),
  { _tag: "PhaseStarted", seq: 24, atMs: 24, phase: "validation" },
];

describe("Committed CLI history", () => {
  for (const columns of [20, 40, 80, 100, 120, 200]) {
    it.effect(
      `retains reasons, notes and phase history after a long operation at ${String(columns)} columns`,
      () => {
        const streams = makeTestOutputStreams({
          stdoutIsTTY: true,
          stderrIsTTY: true,
          columns,
          rows: 4,
        });
        const layer = Layer.provide(
          ScreenLive({ colors: { stdout: false, stderr: false }, animate: true }),
          Layer.merge(
            Layer.provide(FrameLive({ animate: true, quiet: false, colors: false }), streams.layer),
            streams.layer,
          ),
        );
        return Effect.gen(function* () {
          const terminal = yield* makeTerminalReplay(columns, 4);
          const screen = yield* Screen;
          const lifecycle = yield* makeOperationLifecycle({
            name: "Updating extensions",
            mode: "apply",
          });
          yield* screen.observe(lifecycle);
          yield* screen.note([{ _tag: "paragraph", text: "Review context remains" }]);
          for (const event of history)
            yield* lifecycle.publish((seq, atMs) => ({ ...event, seq, atMs }));
          yield* lifecycle.settle("partial");
          yield* lifecycle.drained.await;
          yield* screen.settle;
          yield* replayBytes(terminal, streams.state.stderr.join(""));
          const output = terminalTranscript(terminal).replace(/\s+/gu, " ");
          expect(output).toContain("Review context");
          expect(output).toContain("The registry refused");
          expect(output).toContain("Finished applying");
          expect(output.indexOf("Review context")).toBeLessThan(output.indexOf("The registry"));
          expect(output.indexOf("The registry")).toBeLessThan(output.indexOf("Finished applying"));
        }).pipe(Effect.provide(layer), Effect.scoped);
      },
    );
  }

  it.effect("keeps the same semantic milestones in pipes without control bytes", () => {
    const streams = makeTestOutputStreams();
    const layer = Layer.provide(
      ScreenLive({ colors: { stdout: false, stderr: false }, animate: false }),
      Layer.merge(
        Layer.provide(FrameLive({ animate: false, quiet: false, colors: false }), streams.layer),
        streams.layer,
      ),
    );
    return Effect.gen(function* () {
      const screen = yield* Screen;
      const lifecycle = yield* makeOperationLifecycle({
        name: "Updating extensions",
        mode: "apply",
      });
      yield* screen.observe(lifecycle);
      for (const event of history)
        yield* lifecycle.publish((seq, atMs) => ({ ...event, seq, atMs }));
      yield* lifecycle.settle("partial");
      yield* lifecycle.drained.await;
      const output = streams.state.stderr.join("");
      expect(output).toContain("The registry refused the request.");
      expect(output).toContain("Finished applying");
      expect(output).not.toContain("\u001b[");
      expect(output).not.toContain("Working on unit");
    }).pipe(Effect.provide(layer), Effect.scoped);
  });

  it("appends a failure reason immediately, including under quiet", () => {
    const previous = history.slice(0, 2).reduce(reduceProgress, initialProgress);
    const next = reduceProgress(previous, failure);
    const doc = progressTransitionDoc(previous, next, { quiet: true });
    expect(paintText(doc, { width: 80, colors: false }).join("\n")).toContain(
      "The registry refused the request.",
    );
  });
});
