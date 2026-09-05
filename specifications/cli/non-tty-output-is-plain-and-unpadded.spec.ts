import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  displayWidth,
  handleInstall,
  handleSkillsList,
  stripTerminalFormatting,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";

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
});
