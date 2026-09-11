import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { Screen } from "./index.js";
import { handleInstall } from "../root/install/handler.js";
import { defineSpecification } from "@agentxm/specification-metadata";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../test-support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/quiet-preserves-machine-diagnostics",
  title: "Quiet machine output preserves results and diagnostics",
  statement:
    "When quiet mode is used with machine output, AXM shall suppress progress events while preserving result documents and non-progress diagnostic events.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "The production machine screen over recording output streams is where progress suppression and diagnostic preservation are decided; the built-CLI rows over real result and diagnostic streams are bound evidence at apps/cli-e2e/src/quiet-machine-output.e2e.test.ts.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "cli/machine-progress-events-follow-the-lifecycle-schema",
    "apps/cli/help/topics/machine-output.md",
    "apps/cli/src/screen/screen-machine.test.ts",
    "apps/cli-e2e/src/quiet-machine-output.e2e.test.ts",
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

  // The three built-CLI rows — both quiet spellings and the ordinary default,
  // over real result and diagnostic streams — need a real process. They run in
  // `apps/cli-e2e/src/quiet-machine-output.e2e.test.ts`, bound to this
  // requirement through that file's `executionBinding`.
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
