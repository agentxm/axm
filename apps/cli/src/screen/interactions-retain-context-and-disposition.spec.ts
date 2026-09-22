import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Terminal from "effect/Terminal";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  makeOperationLifecycle,
  ResolvePlanInteraction,
  type Plan,
} from "@agentxm/workspace/transitions/planning";
import { ResolvePlanInteractionLive } from "../cli-runtime/resolve-plan-interaction-live.js";

import { TestFlagsLayer } from "../cli-flags/index.js";
import { FrameLive } from "./frame.js";
import { Screen, ScreenLive } from "./screen.js";
import { makeTestOutputStreams } from "./streams.js";
import { pickAsk, type Ask } from "./ask/ask.js";
import {
  makeTerminalReplay,
  replayBytes,
  terminalTranscript,
} from "../test-support/terminal-replay.js";

export const specification = defineSpecification({
  requirement: "cli/interactions-retain-context-and-disposition",
  title: "Interactions retain their context and outcome",
  statement:
    "AXM shall preserve review and required-action context before interaction controls, append each accepted answer or cancellation and each wait's truthful disposition, and keep input and foreground ownership exclusive while other observed work advances or settles.",
  class: "human-factors",
  role: "experience",
  goals: ["actionable-diagnostics", "safe-repetition"],
  methods: ["example"],
  derivedFrom: ["cli/output-preserves-committed-history"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const press = (name: string): Terminal.UserInput => ({
  input: name.length === 1 ? Option.some(name) : Option.none(),
  key: { name, ctrl: false, meta: false, shift: false },
});

const harness = (quiet = false) =>
  Effect.gen(function* () {
    const keys = yield* Queue.make<Terminal.UserInput, Cause.Done>();
    const opened = yield* Queue.unbounded<void>();
    const readers = yield* Ref.make(0);
    const terminal = Terminal.make({
      columns: Effect.succeed(80),
      rows: Effect.succeed(4),
      readInput: Effect.gen(function* () {
        yield* Ref.update(readers, (value) => value + 1);
        yield* Effect.addFinalizer(() => Ref.update(readers, (value) => value - 1));
        yield* Queue.offer(opened, undefined);
        return Queue.asDequeue(keys);
      }),
      readLine: Effect.succeed(""),
      display: () => Effect.void,
    });
    const streams = makeTestOutputStreams({
      stdoutIsTTY: true,
      stderrIsTTY: true,
      columns: 80,
      rows: 4,
    });
    const dependencies = Layer.mergeAll(
      streams.layer,
      Layer.provide(FrameLive({ animate: true, colors: false, quiet }), streams.layer),
      Layer.succeed(Terminal.Terminal, terminal),
      TestFlagsLayer({ nonInteractive: false, quiet }),
    );
    const layer = Layer.provideMerge(
      ScreenLive({ animate: true, colors: { stdout: false, stderr: false }, quiet }),
      dependencies,
    );
    return { layer, streams, keys, opened, readers };
  });

const questions: ReadonlyArray<{ ask: Ask<unknown>; keys: ReadonlyArray<string>; answer: string }> =
  [
    {
      ask: {
        _tag: "Confirm",
        question: "Apply reviewed changes?",
        label: "Decision",
        choices: [
          { key: "n", word: "no", value: false },
          { key: "y", word: "yes", value: true },
        ],
      },
      keys: ["y"],
      answer: "Decision yes",
    },
    {
      ask: {
        _tag: "Choose",
        question: "Choose an instructions source",
        label: "Source",
        options: [
          { title: "AGENTS.md", value: "AGENTS.md" },
          { title: "CLAUDE.md", value: "CLAUDE.md" },
        ],
      },
      keys: ["down", "return"],
      answer: "Source CLAUDE.md",
    },
    {
      ask: {
        _tag: "Input",
        question: "Name the instructions file",
        label: "File",
        validate: (value) =>
          value.length > 0 ? Result.succeed(value) : Result.fail("Enter a name"),
      },
      keys: ["return", "n", "e", "w", "return"],
      answer: "File new",
    },
    {
      ask: pickAsk({
        question: "Select agents",
        label: "Agents",
        noun: { one: "agent", other: "agents" },
        min: 1,
        options: [{ title: "Codex", value: "codex" }],
      }),
      keys: ["space", "return"],
      answer: "Agents Codex",
    },
  ];

describe("durable interactions", () => {
  it.effect(
    "retains a required candidate and its risks before quiet approval, including details",
    () =>
      Effect.gen(function* () {
        const h = yield* harness(true);
        const layer = Layer.provideMerge(ResolvePlanInteractionLive, h.layer);
        yield* Effect.gen(function* () {
          const screen = yield* Screen;
          const interaction = yield* ResolvePlanInteraction;
          const plan: Plan = {
            _tag: "Plan",
            name: "Replace source",
            description: Option.none(),
            riskConditions: [
              {
                level: "confirmable",
                id: "source-change",
                detail: "The authored source will be replaced.",
              },
            ],
            jobs: [
              {
                concurrency: 1,
                steps: [
                  {
                    readiness: "ready",
                    label: "@acme/skills/review",
                    run: Effect.succeed({ result: "success", message: "Applied" }),
                  },
                ],
              },
            ],
          };
          yield* interaction.presentPlan(plan, { mode: "apply" });
          const fiber = yield* interaction
            .confirmApplyChanges({ command: ["sync"], arguments: [] })
            .pipe(Effect.forkChild);
          yield* Queue.take(h.opened);
          const before = h.streams.state.stderr.join("");
          expect(before).toContain("@acme/skills/review");
          expect(before).toContain("The authored source will be replaced.");
          expect(before.indexOf("@acme/skills/review")).toBeLessThan(
            before.indexOf("Apply changes?"),
          );
          yield* Queue.offer(h.keys, press("d"));
          yield* Queue.take(h.opened);
          yield* Queue.offer(h.keys, press("n"));
          expect(yield* Fiber.join(fiber)).toBe("declined");
          yield* screen.settle;
          const terminal = yield* makeTerminalReplay(80, 4);
          yield* replayBytes(terminal, h.streams.state.stderr.join(""));
          const text = terminalTranscript(terminal).replace(/\s+/gu, " ");
          expect(text).toContain("The authored source will be replaced.");
          expect(text.split("Apply changes no")).toHaveLength(2);
          expect(text).not.toContain("Apply changes details");
        }).pipe(Effect.provide(layer), Effect.scoped);
      }),
  );

  for (const quiet of [false, true]) {
    for (const example of questions) {
      it.effect(
        `${example.ask._tag} retains context and exactly one accepted answer (quiet=${quiet})`,
        () =>
          Effect.gen(function* () {
            const h = yield* harness(quiet);
            yield* Effect.gen(function* () {
              const screen = yield* Screen;
              const terminal = yield* makeTerminalReplay(80, 4);
              yield* screen.instruction([
                { _tag: "paragraph", text: "Reviewed candidate: @acme/skills/review" },
              ]);
              const fiber = yield* screen.ask(example.ask).pipe(Effect.forkChild);
              yield* Queue.take(h.opened);
              for (const key of example.keys) yield* Queue.offer(h.keys, press(key));
              yield* Fiber.join(fiber);
              yield* screen.note([{ _tag: "paragraph", text: "Later work" }]);
              yield* screen.settle;
              yield* replayBytes(terminal, h.streams.state.stderr.join(""));
              const text = terminalTranscript(terminal).replace(/\s+/gu, " ");
              expect(text).toContain("Reviewed candidate: @acme/skills/review");
              expect(text.split(example.answer)).toHaveLength(2);
              expect(text.indexOf("Reviewed candidate")).toBeLessThan(text.indexOf(example.answer));
              expect(text.indexOf(example.answer)).toBeLessThan(text.indexOf("Later work"));
              expect(yield* Ref.get(h.readers)).toBe(0);
            }).pipe(Effect.provide(h.layer), Effect.scoped);
          }),
      );
    }
  }

  it.effect(
    "keeps a question foreground when a nested operation settles and serializes a second question",
    () =>
      Effect.gen(function* () {
        const h = yield* harness();
        yield* Effect.gen(function* () {
          const screen = yield* Screen;
          const parent = yield* makeOperationLifecycle({ name: "Setup workspace", mode: "apply" });
          const child = yield* makeOperationLifecycle({ name: "Install skill", mode: "apply" });
          for (const lifecycle of [parent, child]) {
            yield* screen.observe(lifecycle);
            yield* lifecycle.publish((seq, atMs) => ({
              _tag: "OperationStarted",
              seq,
              atMs,
              operationId: lifecycle.operationId,
              name: lifecycle.name,
              mode: "apply",
            }));
          }
          const first = yield* screen
            .ask({
              _tag: "Confirm",
              question: "First decision",
              choices: [{ key: "y", word: "yes", value: true }],
            })
            .pipe(Effect.forkChild);
          yield* Queue.take(h.opened);
          const second = yield* screen
            .ask({
              _tag: "Confirm",
              question: "Second decision",
              choices: [{ key: "y", word: "yes", value: true }],
            })
            .pipe(Effect.forkChild);
          yield* child.publish((seq, atMs) => ({
            _tag: "UnitResolved",
            unitId: "shared",
            label: "Shared label",
            state: "failed",
            index: 0,
            failure: { category: "validation", detail: "Child refused this work" },
            seq,
            atMs,
          }));
          yield* child.settle("partial");
          yield* child.drained.await;
          expect(yield* Ref.get(h.readers)).toBe(1);
          expect(h.streams.state.stderr.join("")).not.toContain("Second decision");
          yield* Queue.offer(h.keys, press("y"));
          yield* Fiber.join(first);
          yield* Queue.take(h.opened);
          expect(yield* Ref.get(h.readers)).toBe(1);
          yield* Queue.offer(h.keys, press("escape"));
          yield* Fiber.await(second);
          yield* parent.settle("completed");
          yield* parent.drained.await;
          const terminal = yield* makeTerminalReplay(80, 4);
          yield* screen.settle;
          yield* replayBytes(terminal, h.streams.state.stderr.join(""));
          const text = terminalTranscript(terminal).replace(/\s+/gu, " ");
          expect(text).toContain("First decision yes");
          expect(text).toContain("Second decision: cancelled");
          expect(text).toContain("Install skill: Shared label: failed");
          expect(yield* Ref.get(h.readers)).toBe(0);
        }).pipe(Effect.provide(h.layer), Effect.scoped);
      }),
  );

  for (const quiet of [false, true]) {
    for (const fails of [false, true]) {
      it.effect(
        `retains wait instructions and a truthful ending (quiet=${quiet}, fails=${fails})`,
        () =>
          Effect.gen(function* () {
            const h = yield* harness(quiet);
            yield* Effect.gen(function* () {
              const screen = yield* Screen;
              yield* Effect.result(
                screen.wait(
                  {
                    subject: "review",
                    label: "Browser review",
                    detail: "waiting on you",
                    status: "Waiting for browser review",
                    brief: [
                      {
                        _tag: "paragraph",
                        text: [
                          { text: "Open " },
                          { text: "https://review.example/request-123", copyable: true },
                        ],
                      },
                    ],
                  },
                  fails ? Effect.fail("Review rejected") : Effect.succeed("Review resolved"),
                ),
              );
              yield* screen.note([{ _tag: "paragraph", text: "Next activity" }]);
              yield* screen.settle;
              const terminal = yield* makeTerminalReplay(80, 4);
              yield* replayBytes(terminal, h.streams.state.stderr.join(""));
              const text = terminalTranscript(terminal).replace(/\s+/gu, " ");
              expect(text).toContain("https://review.example/request-123");
              expect(text).toContain(fails ? "waiting ended before completion" : "Wait completed");
              expect(text).not.toContain("Authorized");
              expect(text.indexOf("https://review.example")).toBeLessThan(
                text.indexOf("Next activity"),
              );
            }).pipe(Effect.provide(h.layer), Effect.scoped);
          }),
      );
    }
  }
});
