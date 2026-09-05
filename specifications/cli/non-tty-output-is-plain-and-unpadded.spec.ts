import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  displayWidth,
  handleInstall,
  handleSkillsList,
  Screen,
  stripTerminalFormatting,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";
import { humanScreenLayer, makeRecordingStreams } from "../support/screen-harness.js";

export const specification = defineSpecification({
  requirement: "cli/non-tty-output-is-plain-and-unpadded",
  title: "A stream that is not a terminal receives plain, unbounded human output",
  statement:
    "When a standard stream receiving human output is not a terminal, AXM shall write no ANSI escape sequence to it and shall not wrap, truncate, or pad any line to a terminal width.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const COLUMNS = 60;
const ESCAPE = "\u001b";

/** Names long enough that one row cannot fit the terminal width. */
const longNames = [
  "an-extremely-long-skill-name-that-exceeds-sixty-columns-alpha",
  "an-extremely-long-skill-name-that-exceeds-sixty-columns-beta",
] as const;

describe("Non-terminal human output", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const listInstalledSkills = (stdoutIsTTY: boolean) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        screen: { kind: "human", stdoutIsTTY, stderrIsTTY: true, columns: COLUMNS },
      });
      cleanups.push(workspace.cleanup);
      for (const name of longNames) {
        const skillPackage = writeLocalSkillPackage(workspace.root, { name });
        yield* handleInstall({
          source: Option.some(skillPackage),
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));
      }
      workspace.streams?.log.splice(0);

      yield* handleSkillsList({ agents: [] }).pipe(Effect.provide(workspace.layer));

      const stdout = workspace.streams?.lines("stdout") ?? [];
      expect(stdout.length).toBeGreaterThan(0);
      return stdout;
    });

  it.effect("a piped stdout carries no escape sequences and every value whole on its line", () =>
    Effect.gen(function* () {
      const stdout = yield* listInstalledSkills(false);

      expect(stdout.join("\n")).not.toContain(ESCAPE);
      for (const name of longNames) {
        expect(stdout.filter((line) => line.includes(name))).toHaveLength(1);
      }
      for (const line of stdout) {
        expect(line.endsWith("…"), line).toBe(false);
        expect(line.endsWith(" "), line).toBe(false);
      }
      // The widest line exceeds the terminal facts, so no width was applied.
      expect(Math.max(...stdout.map(displayWidth))).toBeGreaterThan(COLUMNS);
    }),
  );

  it.effect("the same document is laid out within the width when stdout is a terminal", () =>
    Effect.gen(function* () {
      const stdout = yield* listInstalledSkills(true);
      for (const line of stdout) {
        expect(displayWidth(stripTerminalFormatting(line)), line).toBeLessThanOrEqual(COLUMNS);
      }
    }),
  );

  for (const row of [
    { label: "two pipes", stdoutIsTTY: false, stderrIsTTY: false },
    { label: "piped stdout and terminal stderr", stdoutIsTTY: false, stderrIsTTY: true },
    { label: "terminal stdout and piped stderr", stdoutIsTTY: true, stderrIsTTY: false },
    { label: "two terminals", stdoutIsTTY: true, stderrIsTTY: true },
  ])
    it.effect(`FORCE_COLOR=1 respects stream boundaries with ${row.label}`, () => {
      const streams = makeRecordingStreams({ ...row, columns: COLUMNS });
      const value = longNames[0] + "-complete-unwrapped-value";
      expect(value.length).toBeGreaterThan(COLUMNS);
      return Effect.gen(function* () {
        const screen = yield* Screen;
        // These are styled, hyperlink-bearing documents, not pre-rendered text.
        // The production Screen and painter decide what each stream receives.
        yield* screen.result([
          {
            _tag: "paragraph",
            text: [
              { text: value, tone: "info", bold: true, link: "https://example.test/extension" },
            ],
          },
        ]);
        yield* screen.note([
          {
            _tag: "paragraph",
            text: [
              { text: value, tone: "warn", bold: true, link: "https://example.test/extension" },
            ],
          },
        ]);
        yield* screen.settle;

        for (const target of [
          { channel: "stdout", terminal: row.stdoutIsTTY },
          { channel: "stderr", terminal: row.stderrIsTTY },
        ] as const) {
          const lines = streams.lines(target.channel);
          expect(lines.length, target.channel).toBeGreaterThan(0);
          if (target.terminal) {
            // A positive control proves the same renderer can emit styling;
            // forcing every stream plain would not satisfy this scenario.
            expect(lines.join("\n"), target.channel).toContain(ESCAPE);
          } else {
            expect(lines, target.channel).toEqual([value]);
            expect(lines.join("\n"), target.channel).not.toContain(ESCAPE);
            expect(Math.max(...lines.map(displayWidth)), target.channel).toBeGreaterThan(COLUMNS);
          }
        }
      }).pipe(Effect.provide(humanScreenLayer(streams, { env: { FORCE_COLOR: "1" } })));
    });
});
