import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { Screen, handleInstall } from "axm.sh/specification-harness";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";
import { makeDirectoryFixture, unattendedProjectSetup } from "../support/directory-harness.js";

export const specification = defineSpecification({
  requirement: "cli/quiet-preserves-machine-diagnostics",
  title: "Quiet machine output preserves results and diagnostics",
  statement:
    "When quiet mode is used with machine output, AXM shall suppress progress events while preserving result documents and non-progress diagnostic events.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  boundary: "process",
  boundaryRationale:
    "Built CLI invocations establish both quiet flag spellings and actual result/error streams; application examples exercise non-progress diagnostics on the production machine screen.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "cli/machine-progress-events-follow-the-lifecycle-schema",
    "packages/cli/help/topics/machine-output.md",
    "packages/cli/src/screen/screen-machine.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Quiet machine diagnostics", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.each([
    { label: "ordinary", flags: [], quiet: false },
    { label: "quiet long flag", flags: ["--quiet"], quiet: true },
    { label: "quiet short flag", flags: ["-q"], quiet: true },
  ])("$label keeps process results and errors visible", async ({ flags, quiet }) => {
    const fixture = makeDirectoryFixture();
    try {
      const setup = await fixture.run(["-C", fixture.selected, ...unattendedProjectSetup]);
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      const source = writeLocalSkillPackage(fixture.root, { name: "quiet-process" });
      const installed = await fixture.run([
        "-C",
        fixture.selected,
        "install",
        source,
        "--json",
        "--non-interactive",
        ...flags,
      ]);
      expect(installed.exitCode, installed.stdout + installed.stderr).toBe(0);
      const result: unknown = JSON.parse(installed.stdout);
      expect(result).toMatchObject({ ok: true, result: { outcome: "applied" } });
      const events: unknown[] = installed.stderr
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const progress = events.filter(
        (event) =>
          typeof event === "object" &&
          event !== null &&
          "type" in event &&
          event.type === "progress",
      );
      if (quiet) expect(progress).toEqual([]);
      else expect(progress.length).toBeGreaterThan(0);
      const refused = await fixture.run([
        "-C",
        fixture.selected,
        "list",
        "--unrecognized-diagnostic-example",
        "--json",
        ...flags,
      ]);
      expect(refused.exitCode).toBe(2);
      const error: unknown = JSON.parse(refused.stdout);
      expect(error).toMatchObject({
        ok: false,
        code: "usage",
        detail: expect.stringContaining("--unrecognized-diagnostic-example"),
      });
      const diagnostics: unknown[] = refused.stderr
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      expect(diagnostics).toContainEqual(
        expect.objectContaining({
          type: "error",
          code: "usage",
          message: expect.stringContaining("--unrecognized-diagnostic-example"),
        }),
      );
    } finally {
      fixture.cleanup();
    }
  });

  it.effect.each([false, true])("quiet=%s preserves diagnostics and the result", (quiet) => {
    const workspace = makeSpecWorkspace({
      screen: { kind: "machine" },
      flags: { json: true, quiet },
    });
    cleanups.push(workspace.cleanup);
    const source = writeLocalSkillPackage(workspace.root, { name: "quiet-example" });
    return Effect.gen(function* () {
      yield* handleInstall({ source: Option.some(source), force: false, preview: false });
      const screen = yield* Screen;
      yield* screen.log({ level: "info", message: "Useful information" });
      yield* screen.log({ level: "warn", message: "Warning remains visible" });
      yield* screen.log({ level: "error", message: "Error remains visible" });
      yield* screen.note([
        {
          _tag: "next",
          actions: [
            {
              description: "Inspect installed extensions",
              cmd: "axm list",
            },
          ],
        },
      ]);
      yield* screen.settle;
      const streams = workspace.streams;
      if (streams === undefined) throw new Error("The example requires real recording streams");
      const events: unknown[] = streams.lines("stderr").map((line) => JSON.parse(line));
      const progress = events.filter(
        (event) =>
          typeof event === "object" &&
          event !== null &&
          "type" in event &&
          event.type === "progress",
      );
      if (quiet) expect(progress).toEqual([]);
      else expect(progress.length).toBeGreaterThan(0);
      expect(events).toEqual(
        expect.arrayContaining([
          { type: "log", level: "info", message: "Useful information" },
          { type: "log", level: "warn", message: "Warning remains visible" },
          { type: "log", level: "error", message: "Error remains visible" },
          { type: "suggestion", description: "Inspect installed extensions", cmd: "axm list" },
        ]),
      );
      const result: unknown = JSON.parse(streams.lines("stdout").join("\n"));
      expect(result).toMatchObject({ ok: true, result: { outcome: "applied" } });
    }).pipe(Effect.provide(workspace.layer));
  });
});
