import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { makeWorkspaceHandlerTestContext } from "../../test-support/test-helpers.js";
import { humanScreenLayer, makeRecordingStreams } from "../../test-support/screen-harness.js";
import { startedUnits } from "../../test-support/presenter-test.js";
import { handleHookTest } from "./test.js";

describe("hooks test output", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const arrange = (passed: boolean) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-hook-output-"));
    cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
    const directory = path.join(root, "hooks", "audit");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, "hook.json"),
      JSON.stringify({
        owner: "@acme",
        type: "hook",
        name: "audit",
        version: "1.0.0",
        implementations: [
          {
            id: "claude",
            protocol: "claude-code",
            bindings: [
              {
                id: "audit",
                event: "PreToolUse",
                handler: { type: "command", runtime: "node", entrypoint: "hook.cjs" },
              },
            ],
          },
        ],
        fixtures: [
          {
            id: "input",
            implementation: "claude",
            binding: "audit",
            input: "input.json",
            expect: { exitCode: passed ? 0 : 1 },
          },
        ],
      }),
    );
    fs.writeFileSync(path.join(directory, "input.json"), "{}");
    fs.writeFileSync(path.join(directory, "hook.cjs"), 'console.log("private-output-marker");');
    return root;
  };

  for (const passed of [true, false]) {
    it.live(
      `emits one machine result for ${passed ? "passing" : "failing"} fixtures with liveness`,
      () => {
        const context = makeWorkspaceHandlerTestContext({
          machine: true,
          wsOptions: { projectRoot: arrange(passed) },
        });
        return Effect.gen(function* () {
          yield* handleHookTest({ directory: "hooks/audit", configuration: "{}", fixture: [] });
          expect(startedUnits(context.rendererState)).toEqual(["declared hook extension fixtures"]);
          expect(context.rendererState.results).toHaveLength(1);
          expect(context.rendererState.results[0]?.data).toMatchObject({
            passed,
            nativeInvocation: "not-observed",
            fixtures: [{ outcome: passed ? "passed" : "failed" }],
          });
          expect(JSON.stringify(context.rendererState.results)).not.toContain(
            "private-output-marker",
          );
        }).pipe(Effect.provide(context.fullLayer));
      },
    );

    it.live(
      `renders ${passed ? "passing" : "failing"} fixtures with the evidence limitation`,
      () => {
        const streams = makeRecordingStreams();
        const context = makeWorkspaceHandlerTestContext({
          screenLayer: humanScreenLayer(streams),
          wsOptions: { projectRoot: arrange(passed) },
        });
        return Effect.gen(function* () {
          yield* handleHookTest({ directory: "hooks/audit", configuration: "{}", fixture: [] });
          const stdout = streams.lines("stdout").join("\n");
          expect(stdout).toContain(
            passed ? "Hook extension fixtures passed" : "Hook extension fixtures failed",
          );
          expect(stdout).toContain("native host invocation was not observed");
          expect(stdout).not.toContain("private-output-marker");
        }).pipe(Effect.provide(context.fullLayer));
      },
    );
  }
});
